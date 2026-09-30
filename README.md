# Академия — образовательная LMS

Русскоязычная LMS на Next.js, TypeScript и Supabase. Владелец создаёт структуру курса, редактирует 11 типов блоков, загружает материалы, публикует редакцию и назначает обучение через Admin.

Репозиторий: [nikitasolonukha/premium-lms](https://github.com/nikitasolonukha/premium-lms). Публичная поставка содержит исходники, миграции, тесты, документацию и QA-материалы. Локальные credentials, база, загруженные приватные файлы, зависимости и результаты сборки в Git не входят.

**Статус выпуска: READY FOR PRODUCTION** в границах поставки проекта для развёртывания. Финальный единый E2E-прогон: 19/19, UAT и пять реальных видеопровайдеров пройдены; проверены 21 экран на семи размерах, обе темы, Windows standalone и Linux-контейнер. Доказательства и эксплуатационные ограничения — в [docs/QA_REPORT.md](docs/QA_REPORT.md). Проект не размещён в интернете.

Локальный Docker восстановлен после OOM. Сохранность прежнего UAT-курса, прогресса и приватных файлов проверена без reset/seed; актуальный Linux-образ собран и прошёл runtime smoke. Диагностика и границы проверки описаны в QA_REPORT. На этом хосте перед Docker build требуется остановить только локальный стек LMS, сохранив данные, чтобы освободить память VM.

## Локальный запуск

Нужны Node.js 22+, npm и Docker Desktop с Linux containers. Все версии npm закреплены в `package-lock.json`. Порты 3000 и 56320–56324 должны быть свободны.

```powershell
git clone https://github.com/nikitasolonukha/premium-lms.git
cd premium-lms
npm install
npm run db:start
npm run setup:local
npm run db:reset
npm run seed
npm run dev
```

Откройте `http://localhost:3000`. Тестовые письма доступны на `http://localhost:56324`.

Seed разрешён только для `http://127.0.0.1:56321` / `http://localhost:56321`: пять аккаунтов, три курса, шесть модулей, двенадцать уроков, все типы блоков, настоящие PDF/DOCX/XLSX/ZIP и изображения. Повторный запуск обновляет те же сущности. Пароли и TOTP-секреты генерируются в **`.local/seed-accounts.json`**; этот файл и `.env.local` запрещены к публикации. Никогда не запускайте seed на production.

Для входа возьмите email и password нужной роли из этого локального файла. У seed Admin/Editor MFA уже подключена: добавьте их `totpSecret` в приложение-аутентификатор как TOTP (6 цифр, SHA-1, 30 секунд) и введите текущий код. Для нового production-владельца используйте bootstrap из OPERATIONS: он подключает собственный TOTP через QR в интерфейсе.

Для экономного локального стека без необязательных сервисов:

```powershell
npx supabase start --exclude studio,realtime,edge-runtime,logflare,vector,supavisor,imgproxy
```

`setup:local` заполняет только локальные переменные из Supabase status. В чистой среде браузер для E2E устанавливается командой `npx playwright install chromium`. Не запускайте `npm ci` одновременно с командами Supabase CLI: Windows блокирует замену работающего supabase.exe.

## Проверки

```powershell
npm run typecheck
npm run lint
npm test
npm run test:coverage
npm run test:db
npx tsx --env-file=.env.local scripts/test-security.ts
npm run build
npm run start
# В другом терминале, с запущенным локальным Supabase:
npm run e2e
```

Деструктивные security-тесты ограничены локальным Supabase. После чистого reset сначала запускайте seed и security suite, затем E2E: UAT создаёт отдельный курс. Между независимыми browser-сценариями локальный fixture очищает только rate counters, поскольку сценарии используют одинаковые seed-аккаунты. Само ограничение не отключается: проверки 429/Retry-After и конкурентного счётчика выполняются внутри выделенных сценариев. Сетевые trace-файлы отключены, чтобы не сохранять пароли, OTP и токены. Скриншоты находятся в `docs/qa/screenshots`, структурированные результаты — в `docs/qa/evidence`.

Не запускайте Docker build одновременно с E2E на малоресурсной VM. Next.js использует два build workers; в Docker ограничен Node heap. Тест внешних видео использует установленный Google Chrome с видимым окном, штатными media-компонентами/Widevine и реальную сеть. Нужна графическая сессия; тест создаёт изолированный профиль, разрешает штатное обновление компонентов и не использует пользовательский профиль. Отказ провайдера не подменяется mock-ответом и оставляет общий QA непрошедшим.

Для повторной проверки своих разрешённых к встраиванию роликов задайте `QA_YOUTUBE_URL`, `QA_VIMEO_URL`, `QA_RUTUBE_URL` в окружении теста и выполните `npx playwright test tests/e2e/video.spec.ts`. Без этих переменных используются публичные примеры. Итог сохраняется в `docs/qa/evidence/video-providers.json`; успешная загрузка iframe без начавшегося воспроизведения не считается PASS. Проверка известных секретов: `node --env-file=.env.local scripts/scan-client-secrets.mjs`.

Дополнительные локальные проверки: `npx tsx --env-file=.env.local scripts/test-scale.ts`, `node scripts/test-container.mjs` после сборки образа `premium-lms-qa:local`. `scripts/test-operations.ts` запускается **до seed на пустой локальной БД** и создаёт первого владельца для теста; после него выполните локальный reset и seed. Эти команды не предназначены для production-базы.

## Роли

| Роль | Полномочия |
|---|---|
| Student | Доступные опубликованные программы, прогресс, сохранённое, собственный профиль |
| Editor | Черновики, структура и учебные материалы; обязательный TOTP |
| Admin | Публикация, пользователи, роли, доступы, категории, бренд, аналитика и аудит; обязательный TOTP |

Editor не изменяет редакцию, которую видят ученики. Назначение роли само по себе не заменяет MFA. Последний действующий Admin защищён от отключения и понижения.

## Эксплуатация

- [Архитектура и расширения](docs/ARCHITECTURE.md)
- [Дизайн и сохранённые референсы](docs/DESIGN.md)
- [Защита, ограничения, MFA recovery](docs/SECURITY.md)
- [Реальные grants, RLS и RPC](docs/RLS_MATRIX.md)
- [Развёртывание, SMTP, резервные копии и восстановление](docs/OPERATIONS.md)
- [QA и критерии выпуска](docs/QA_REPORT.md)

Оплата, подписки, организации, community, экзамены, сертификаты, SSO и DRM в пользовательскую поставку не входят. Mux и Cloudflare Stream представлены контрактом расширения; работающими интеграциями они не обозначаются.
