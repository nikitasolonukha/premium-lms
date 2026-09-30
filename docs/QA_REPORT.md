# QA Report — Академия

**READY FOR PRODUCTION — в согласованных границах поставки проекта для развёртывания.** Дата аудита: 30 сентября 2026. Все 45 пунктов сопоставлены с проверками ниже; обязательные локальные сценарии пройдены, открытых Critical/High не осталось в пределах аудита. Проверены production standalone Next.js, настоящий изолированный Supabase и актуальный Linux-образ. Публичное размещение — отдельный этап.

## Среда и границы доказательств

Windows, Node 22.19.0, npm 11.9.0, Next.js 16.3.7, React 19.3.0, Supabase CLI 2.118.0 / PostgreSQL 17. Порты: приложение 3000, Supabase 56321, PostgreSQL 56322, Mailpit 56324. Разрушительные проверки ограничены этим локальным стеком. Удалённые проекты и чужие Docker volumes не использовались.

Основные браузерные сценарии выполняются в Playwright Chromium. Проверка видео выполняется в установленном Chrome 154.0.8037.92 с видимым окном и доступным Widevine; используется отдельный временный профиль, без чтения пользовательского профиля. Мобильные проверки — браузерные viewport, не физические iOS/Android устройства. SMTP подтверждён локальным Mailpit; доставка с production-домена проверяется при размещении по OPERATIONS.md.

## Команды и результаты

| Проверка | Результат и доказательство |
|---|---|
| `npm ci --cache ../../work/npm-cache` после удаления `.next` | PASS: 550 packages, audit 551, 0 vulnerabilities. Работающий Supabase CLI должен завершиться перед переустановкой npm на Windows. |
| `npm install --cache ../../work/npm-cache` | PASS: lockfile установлен, 0 vulnerabilities. Есть предупреждение о поддержке ESLint 9; версия закреплена для совместимости с Next. |
| `supabase db reset --local` | Чистое применение миграций: [migrations.log](qa/evidence/migrations.log). |
| `npm run seed` дважды | [seed.log](qa/evidence/seed.log): пять аккаунтов, три курса, шесть модулей, двенадцать уроков, 15 приватных assets. |
| `npm run typecheck` | [typecheck.log](qa/evidence/typecheck.log). |
| `npm run lint` | [lint.log](qa/evidence/lint.log). |
| `npm run test:coverage` | 28 unit-тестов, включая 3 сценария отказа smoke-скрипта с имитацией Docker; [unit-tests.log](qa/evidence/unit-tests.log). Покрываются выбранные доменные модули, а не весь UI: строки 95.89%, ветви 95.63%. Имитация не подтверждает реальный Linux runtime. |
| `npm run test:db` | PASS: 5 групп инвариантов — RLS, отсутствие прямых mutations, public SECURITY INVOKER, закрытый Storage, атомарный счётчик. |
| `tsx --env-file=.env.local scripts/test-security.ts` | [32 прямых security-сценария](qa/evidence/security-api.json). |
| `tsx --env-file=.env.local scripts/test-scale.ts` | [300 уроков / 299 завершений](qa/evidence/scale-progress.json); полный прогресс не обрезается лимитом REST 200. |
| `tsx --env-file=.env.local scripts/test-operations.ts` до seed | [11 проверок оператора](qa/evidence/operations.json): первый Admin, SMTP invite, пароль, MFA, recovery, cleanup. Требует пустую локальную БД. |
| `npm run build` / `npm start` | [build.log](qa/evidence/build.log); standalone server.js, без dev-сервера. |
| `docker build --tag premium-lms-qa:local .` / `node scripts/test-container.mjs` | PASS актуального образа: [build log](qa/evidence/docker-build.log), [runtime smoke](qa/evidence/container.json): UID 1001, реальная БД, public 200, env отсутствует; временный контейнер остановлен и файл credentials удалён. Сборка выполнена при остановленном локальном Supabase. Предыдущий [OOM incident](qa/evidence/runtime-incident.json) закрыт после восстановления и повторной проверки. |
| `npx tsx --env-file=.env.local scripts/test-recovery.ts` | PASS: [runtime-recovery.json](qa/evidence/runtime-recovery.json), прежний UAT-курс/11 блоков/завершённый прогресс, Admin MFA, декодирование изображения и побайтовый PDF, Student B denied. Без reset/seed; выборочная, не полная сверка всех объектов. |
| `npx playwright test --reporter=list,json` | PASS: единый финальный прогон **19/19**, без skipped и retries, включая все пять реальных внешних/прямых плееров. [e2e-summary.json](qa/evidence/e2e-summary.json). |
| `node --env-file=.env.local scripts/scan-client-secrets.mjs` | Число проверенных файлов и результат последнего scan: [client-secrets.json](qa/evidence/client-secrets.json). Сравниваются исходники, конфигурация, миграции, тесты, docs/evidence/logs и browser bundles с известными серверными ключами, локальными паролями и TOTP. |

[Сводка браузерных прогонов](qa/evidence/e2e-summary.json) сохраняет историю прошлых неудачных запусков и последний полный набор: **19 PASS / 0 FAIL / 0 skipped**. Финальный UAT заново создал курс через Admin, проверил все 11 блоков, публикацию, назначение, Student A/B и скрытый черновик Editor. Это один зелёный запуск на production-сборке после последних исправлений контраста, областей нажатия и клавиатурной прокрутки.

Между независимыми сценариями очищаются только локальные rate counters для повторно используемых seed-аккаунтов. Проверки реального 429/Retry-After и конкурентных счётчиков выполняются с включённым ограничением. Визуальный обход разделён на две независимые группы: 10 основных и 11 дополнительных экранов. Прежний сплошной обход исчерпывал настоящий media-лимит и получал 429: [диагностика](qa/evidence/responsive-http-diagnostic.json). В финальном обходе обе группы прошли без HTTP-ошибок; лимит 30/мин не изменялся. Docker build не запускался параллельно с финальным browser QA.

## Матрица всех 45 пунктов исходного QA-ТЗ

PASS относится к указанному проверенному сценарию и его границам. FAIL/UNVERIFIED блокируют общий статус READY.

| № | Пункт исходного ТЗ | Статус | Доказательство и граница проверки |
|---|---|---|---|
| 1 | BUILD / STATIC CHECKS | PASS | Typecheck/lint/build и 28 unit-тестов прошли. Финальные изменения интерфейса проверены в Windows standalone и новом Linux-образе; логи выше. |
| 2 | CLEAN INSTALL | PASS | `.next` удалён, `npm ci`, `npm install`, чистые миграции, повторный seed, production запуск. |
| 3 | DATABASE QA | PASS | `test-db.ts`, `test-security.ts`; FK/unique/idempotency/soft delete; реальные [grants и policies](RLS_MATRIX.md). |
| 4 | RLS / SECURITY | PASS | [security-api.json](qa/evidence/security-api.json): anon, Student A/B, Editor/Admin, staff без AAL2; прямые REST/RPC/Storage. |
| 5 | AUTH QA | PASS | [auth.json](qa/evidence/auth.json), [operations.json](qa/evidence/operations.json): Mailpit confirmation/recovery/invite, неверный пароль/OTP, TOTP, HttpOnly/SameSite cookies, logout/back. |
| 6 | ROLE ROUTING | PASS | Student `/admin` запрещён; Editor не публикует; Admin входит после MFA; прямые sensitive RPC запрещены неподходящей роли. |
| 7 | STUDENT FLOW | PASS | [uat.json](qa/evidence/uat.json): курс → урок → воспроизведение → PDF → завершение → повторный вход → следующий урок. |
| 8 | COURSE ACCESS | PASS | [security-api.json](qa/evidence/security-api.json), [file-expiry.json](qa/evidence/file-expiry.json): разные назначения, последовательные уроки, отзыв, повторная выдача. |
| 9 | COURSE MANAGEMENT | PASS | [cms.json](qa/evidence/cms.json): создать, сортировать, дублировать независимо, preview, архивировать; UAT — создание полностью через UI. |
| 10 | LESSON EDITOR | PASS | Расширенный [UAT](qa/evidence/uat.json): все 11 типов, точное совпадение данных БД после reload, 11 блоков в preview и Student render. [block-operations.json](qa/evidence/block-operations.json): duplicate ID, keyboard reorder, cancel/delete/reload; autosave и конфликт вкладок. |
| 11 | VIDEO QA | PASS | [video-providers.json](qa/evidence/video-providers.json): YouTube, Vimeo, Rutube, direct MP4 и разрешённый external iframe PASS. У каждого currentTime > 2 секунд, мобильный размер, fullscreen контейнера LMS и видимый watermark. |
| 12 | FILE UPLOADS | PASS | [media-formats.json](qa/evidence/media-formats.json), [file-expiry.json](qa/evidence/file-expiry.json): 7 форматов; побайтовый download, длинное имя, delete/re-upload и фактическое истечение 60s. |
| 13 | DRAFT / PUBLISH | PASS | Editor сохраняет отдельную редакцию; Student читает только опубликованную; атомарная публикация Admin и скрытые уроки проверены через UI и RPC. |
| 14 | ADMIN USERS | PASS | [management.json](qa/evidence/management.json): 25 пользователей / страницы 20+5 без пересечений, email/role/course filters, изменение роли, disable/re-enable. |
| 15 | EDITOR ROLE | PASS | [security-api.json](qa/evidence/security-api.json), UAT: черновики доступны; публикация/роли/доступы/настройки/категории запрещены. |
| 16 | SEARCH | PASS | Прямой поиск не раскрывает draft; [discovery.json](qa/evidence/discovery.json): RU/EN, регистр, часть слова, категория, tag, empty и чужие счётчики. |
| 17 | FILTERS / SORTING | PASS | User filters проверены UI; category/tag/search/sort + status до pagination и URL/reload/reset прошли [discovery](qa/evidence/discovery.json). |
| 18 | PROFILE | PASS | [settings-profile.json](qa/evidence/settings-profile.json): имя/фамилия/avatar сохраняются после reload и login; пароль и MFA в auth suite. |
| 19 | EMPTY STATES | PASS | Пустая БД → Admin analytics; empty search/catalog; отсутствующие сохранённые; страницы объясняют следующий шаг. [operations.json](qa/evidence/operations.json), [large-course.json](qa/evidence/large-course.json). |
| 20 | ERROR STATES | PASS | [cms.json](qa/evidence/cms.json): offline save/retry и dirty guard; неверные URL/UUID → 404; oversized/malformed upload; 403/429, Retry-After; ошибки без stack trace в UI. |
| 21 | RESPONSIVE QA | PASS | [Основные экраны](qa/evidence/responsive.json) и [дополнительные](qa/evidence/responsive-secondary.json): **147 сочетаний** — 21 экран × 7 размеров, без горизонтального overflow. |
| 22 | MOBILE LESSON UX | PASS | Drawer открывается/закрывается; Escape возвращает фокус; fixed lesson controls; страницы курса/урока включены в семь viewport. |
| 23 | TOUCH QA | PASS | Измерения `touch-*.json`: на 21 мобильном экране нет видимых ссылок, кнопок или select меньше 44 px. Исправлены также landing logo и ссылки библиотеки. Проверена браузерная геометрия, не физическое устройство. |
| 24 | VISUAL QA | PASS | 21 экран × desktop/mobile/dark = **63 основных PNG**, ссылки ниже. Изображения декодированы, naturalWidth > 0. Отдельные доказательства UAT и плееров сохранены дополнительно. |
| 25 | LONG CONTENT QA | PASS | [large-course.json](qa/evidence/large-course.json): 21 модуль, 63 урока, title 180, 12 tags, длинное описание; дополнительно 300 уроков в scale. |
| 26 | CONTENT EDGE CASES | PASS | Emoji, кириллица, Latin, спецсимволы и HTML как текст; SQL/JSON/Zod запрещают HTML/script и неверные video IDs; deep Rich text/unsafe URLs в unit/security. |
| 27 | ACCESSIBILITY | PASS | Axe WCAG2A/AA/2.1AA — **63 проверки без нарушений**; keyboard dialogs/focus/dnd/reduced motion. Мобильная таблица аналитики получает фокус и действительно прокручивается ArrowRight. Это не полная сертификация всех сценариев экранного диктора. |
| 28 | PERFORMANCE | PASS | [scale-progress.json](qa/evidence/scale-progress.json), серверные страницы 12/20, request-scoped DAL, dynamic TipTap. Запрос 300 уроков ускорен с 8174 до 142–189 мс на данном хосте; последний замер 189 мс, не SLA. |
| 29 | NETWORK REQUESTS | PASS | В обеих финальных responsive-группах нет same-origin HTTP ≥400. Пять видеопровайдеров прошли отдельную реальную проверку. Ошибки сети и 429 отдельно проверены и не маскируются. |
| 30 | CONSOLE | PASS | Финальный visual suite: пустые pageerror и console error/warning. Сервер отдельно логирует закрытия потока при прерванной навигации; это не browser console/hydration ошибка. |
| 31 | REFRESH QA | PASS | Auth/profile/CMS/direct course/lesson reload проверены; данные и актуальная опубликованная редакция сохраняются. |
| 32 | BROWSER HISTORY | PASS | Logout + back не восстанавливает private session; course/lesson back-forward в large-course suite; dirty navigation вызывает диалог. |
| 33 | DUPLICATE ACTIONS | PASS | [UAT](qa/evidence/uat.json): настоящие double-click Create/Save/Publish/Complete, одна запись курса/публикации/progress. [repeat-upload.json](qa/evidence/repeat-upload.json): двойной клик выбора файла + повторный change при незавершённом запросе, ровно один ready asset и один Storage PUT. Enroll/progress защищены уникальностью в БД. |
| 34 | CONCURRENT EDITING | PASS | [cms.json](qa/evidence/cms.json): две реальные вкладки, BroadcastChannel notice, conflict и загрузка актуальной версии; устаревший writer не перезаписывает данные. |
| 35 | DESTRUCTIVE ACTIONS | PASS | Подтверждение module/block/course archive; отмена сохраняет блок; used media/category и последний Admin защищены в БД. |
| 36 | SLUGS | PASS | [security-api.json](qa/evidence/security-api.json): изменение title сохраняет URL; явное изменение slug создаёт alias; уникальность enforced в БД. |
| 37 | SETTINGS | PASS | [settings-profile.json](qa/evidence/settings-profile.json): имя/цвет/footer/support/logo/favicon, watermark; audit и RBAC на изменения. |
| 38 | THEME | PASS | Light default, dark toggle/reload; 21 dark screenshot и соответствующие Axe-проверки без нарушений. Исправлен контраст peach badges в светлой теме. |
| 39 | SEO / INDEXING | PASS | [seo-errors.json](qa/evidence/seo-errors.json): private noindex, robots disallow, sitemap только публичный `/`, metadata/canonical; CSP и nosniff. |
| 40 | TESTS | PASS | 28 unit + 5 DB groups + 32 direct security + 11 operator checks; единый финальный browser-прогон **19/19 PASS**, включая обязательный video QA. |
| 41 | DEMO / SEED QA | PASS | Реальный повторяемый seed отдельно от компонентов, все 11 типов/форматы, разные доступы и прогресс. Локальные пароли случайные и игнорируются Git. |
| 42 | SECRETS | PASS | [client-secrets.json](qa/evidence/client-secrets.json): 0 известных секретов; оба server secrets явно загружены для сравнения. Env/.local исключены из Git и Docker context, traces выключены. На момент основного QA Git-истории не было; после аудита по запросу владельца подготовлен первый публичный коммит с отдельной проверкой состава. Это проверка известных значений, не доказательство отсутствия любого возможного секрета. |
| 43 | PRODUCTION CONFIG | PASS | Windows standalone и актуальный Linux image build прошли. Новый runtime smoke проверяет реальную БД, public 200, UID 1001, отсутствие env в образе и успешную очистку. OOM закрыт после восстановления без reset/seed; инструкции ресурсов и deployment — в [OPERATIONS](OPERATIONS.md). Публичного deployment не было. |
| 44 | FINAL USER ACCEPTANCE TEST | PASS | [uat.json](qa/evidence/uat.json): Admin UI → новый курс со всеми блоками/cover/PDF → publish/grant → Student A playback/image/download/complete/relogin/resume → B denied → Editor draft hidden. |
| 45 | FINAL REPORT | PASS | Все 45 исходных пунктов сопоставлены с доказательствами. Опубликованы команды, снимки, исправленные дефекты и границы поставки. Непроверенный production deployment не обозначается как выполненный. |

## Сводка по областям

| Area | Status | Notes |
|---|---|---|
| Auth | PASS | Mailpit confirmation/recovery/invite, TOTP, refresh/logout, HttpOnly cookies. |
| RBAC | PASS | Student/Editor/Admin, staff AAL2, последний Admin, прямые sensitive RPC. |
| RLS | PASS | 32 прямых security-сценария; реальные grants/policies в RLS_MATRIX. |
| Courses | PASS | Создание, draft/publish, duplicate, archive, slug aliases, фильтры. |
| Lessons | PASS | Стабильные IDs, порядок, последовательная доступность, 300-lesson regression. |
| Editor | PASS | 11 блоков, autosave, два writer, dirty guard, keyboard dnd, preview. |
| Video | PASS | Все 5 адаптеров: реальное воспроизведение >2 секунд, grants, mobile и fullscreen/watermark в Chrome. |
| Files | PASS | 7 форматов, проверка содержимого, побайтовое скачивание, revoke и реальный TTL. |
| Progress | PASS | Идемпотентное завершение, resume после входа, текущий published denominator. |
| Enrollments | PASS | Выдача/отзыв через UI, уникальность и отсутствие контента у Student B. |
| Admin | PASS | Курсы, пользователи, роли, категории, материалы, аналитика, настройки, audit. |
| Responsive | PASS | 147 сочетаний размеров/экранов, 44 px targets, 63 Axe-проверки, drawer и клавиатурная прокрутка; браузерная эмуляция. |
| Security | PASS | Проверенные RBAC/RLS/CSRF/XSS/upload/rate/session сценарии; ограничения в SECURITY. |
| Performance | PASS | Пагинация, lazy editor, 300 уроков/299 завершений за 189 мс локально; не нагрузочный SLA. |
| Production Build | PASS | Windows standalone и актуальный Linux-образ; smoke после восстановления подтверждает БД, public 200, UID 1001 и очистку. |

## Закрытие video gate и ограничения

Открытых Critical/High в проверенном объёме не осталось. Ранее обязательный video gate был High: в headless Chrome YouTube/Vimeo не начинали поток. Исторические [baseline](qa/evidence/video-baseline.jsonl), [YouTube](qa/evidence/youtube-standard-baseline.json) и failure PNG сохранены как история, а не текущий результат.

Диагностика показала отсутствие Widevine в headless окружении: [API и capability](qa/evidence/player-api-diagnostic.jsonl). Обычный установленный Chrome воспроизвёл Vimeo: [baseline](qa/evidence/vimeo-normal-chrome-baseline.json). В изолированном headed Chrome с разрешённым штатным обновлением компонентов Widevine доступен: [probe](qa/evidence/widevine-headed-probe.json). После этой настройки исходные LMS-ролики YouTube/Vimeo, без подмены их URL или mock-ответов, прошли реальный playback; все пять адаптеров повторно прошли внутри общего E2E. Точная причина прежних ошибок YouTube не доказана: состояние внешнего сервиса или сети могло измениться. Защита сайтов, авторизация провайдеров и DRM не обходились.

Видео-тест требует установленного Google Chrome и графической сессии. Для него Playwright использует `headless: false` и не добавляет `--disable-component-update`; пользовательский профиль и глобальные настройки браузера не изменяются. Ошибки внешних источников остаются ошибками теста. Обоснование совместимости — [официальная диагностика Vimeo для Chrome/DRM](https://help.vimeo.com/hc/en-us/articles/36178751934481-Troubleshooting-Video-playback-issues-and-DRM-Chrome) и [YouTube IFrame API](https://developers.google.com/youtube/iframe_api_reference).

Публичные видео не считаются защищённым потоком. Mux/Cloudflare имеют только контракт расширения. Watermark проверен в fullscreen контейнера LMS; собственный fullscreen внешнего iframe и скачанные файлы имеют ограничения, описанные в SECURITY. Уже выданные file/image grants сохраняют силу до TTL. Проверка структуры файла не заменяет антивирус.

Оставшиеся границы поставки: публичное развёртывание, production SMTP/HTTPS/domain и восстановление резервной копии в отдельном staging не выполнялись; инструкции находятся в OPERATIONS. Мобильные размеры проверены в браузере, не на физических устройствах. На момент основного QA Git-репозитория не было; после аудита по запросу владельца создан репозиторий с первым коммитом. Удалённый CI не подключён, зелёный CI-run не заявляется. Это не открытые функциональные Critical/High данного локального релиза, но обязательные эксплуатационные проверки перед подачей реального трафика.

Локальный production-аудит: **84/100 — готов к развёртыванию с указанными эксплуатационными оговорками**. Оценка ограничена отсутствием подтверждённого CI; не является сертификацией. Проверены исходники, миграции/grants, сборки, настоящий runtime, auth/RLS/media границы, UAT и документация rollback. Следующий этап владельца — отдельное staging-развёртывание по OPERATIONS, затем решение о публичном запуске.

## Исправленные дефекты

| Дефект | Исправление / повторная проверка |
|---|---|
| PUBLIC EXECUTE открывал service-only RPC | Удалены унаследованные grants, установлены глобальные defaults; прямой вызов пользователем запрещён security suite. |
| Dev logging мог печатать аргументы Server Functions | Отключён, локальные секреты заменены и сессии отозваны. Proxy/APM инструкции исключают callback/download tokens. |
| Скачивание кириллицы давало URL-encoded имя; service lookup не имел grants | Узкий service-only metadata RPC + 60s HMAC grant + RFC 5987 streaming; download и реальное истечение проверены. |
| Сохранение нового курса remount-ило редактор | Убрана родительская revalidation на autosave, оставлена на publish/archive; UAT проходит. |
| Publish мог взять старый снимок | Публикация ожидает завершения dirty save. |
| Keyboard dnd возвращал элемент назад при прокрутке | Instant scroll у KeyboardSensor; модуль, урок и блок сохраняют новый порядок. |
| Свёрнутая мобильная подпись лишала кнопку доступного имени | Явные aria-label, уникальные IDs в Field, фокус и Axe. |
| Sr-only заголовок таблицы создавал overflow | Локальный containing block у table-wrap; семь размеров. |
| Переключение темы временно снижало контраст | disableTransitionOnChange; постоянный светлый muted/badge contrast исправлен. |
| Часть мобильных targets была меньше 44 px | Увеличены ссылки, breadcrumbs, palette, lesson controls и навигация; автоматическое измерение включено в QA. |
| Progress обрезался max_rows=200; 299/300 давало 100% | Course JSON RPC + floor в SQL/TS; 300-lesson regression. |
| RLS проверял доступ заново для каждой строки | Statement-cached разрешённые revision IDs; 32 security сценария повторены после оптимизации. |
| Private-only tags могли появиться вне доступных курсов | Tags RLS ограничен доступными редакциями; тест A/B. |
| Отсутствовал поиск по taxonomy / status filter | Отдельная forward migration; status применяется до LIMIT/count; новые discovery тесты. |
| Незавершённые загрузки не очищались из-за grants | Operator SQL + service Storage с advisory lock, rejected retry и защитой ready; 11 operator checks. |
| Неверные UUID/filter вызывали backend errors | Валидация до RPC, безопасная 404; direct URL tests. |
| Deep rich text, локальные URL с trailing dot, неверные video IDs | Ограничение глубины, нормализация URL, SQL semantic checks; unit и direct RPC. |
| Нормализация Vimeo/Rutube теряла access-параметры | Сохраняются только валидные `h`/`p`, дубли и опасные значения запрещены; регрессионный unit сначала упал, затем прошёл; реальный Rutube playback PASS. |
| Мобильный iframe мог быть ниже минимума YouTube | Минимальная высота video-frame 200 px согласно IFrame API; адаптивный обход повторён. |
| Видео-тест использовал старый YouTube selector и лишний native play | Выбор доступной кнопки Play, без подавления ошибки click; lifecycle YouTube/Vimeo управляется их собственными controls. Измеряется реальный currentTime, ошибки поставщика сохраняются на скриншотах. |
| Medium: повторный change файла создавал второй upload intent во время первой загрузки | Синхронная in-flight блокировка в Uploader, сброс в finally. До исправления тест получил две ready-записи, после — одну и один Storage PUT. Все 7 форматов и расширенный UAT повторены. |
| Smoke-скрипт мог записать PASS до успешного stop и оставить временный файл с credentials при сбое очистки | PASS записывается после очистки; удаление env выполняется и при отказе stop. Docker/HTTP имеют таймауты, попытка stop ограничена уникальным контейнером этого запуска даже при timeout команды run. Три новых unit-сценария сначала упали, затем прошли; это проверка управляющего скрипта с имитацией отказов, не Linux runtime. |
| OOM общей Docker VM прервал сборку и доступность LMS | После внешнего восстановления Engine проверены прежний курс/прогресс/файлы без reset/seed. Остановлены только семь контейнеров LMS, новый образ собран, стек возвращён и реальный Linux smoke прошёл. Чужие контейнеры и volumes не изменялись. |
| Student smoke предполагал начальный seed-прогресс при повторном прогоне | После UAT/recovery «Продолжить» корректно вёл к сохранённому следующему уроку. Smoke теперь сначала открывает ожидаемый урок через Student UI и возвращается на dashboard; проверки изображения, перехода и заголовка сохранены. Повтор Student/Admin smoke 2/2 PASS. |
| Мобильные ссылки landing logo и библиотеки имели область нажатия меньше 44 px | Увеличены кликабельные области; все 21 экран повторно измерены, overflow не появился. |
| Мобильная таблица аналитики не получала клавиатурный фокус | Именованная region с tabIndex; E2E проверяет фокус и фактическую прокрутку ArrowRight. |
| Светлые peach badges журнала действий имели контраст 3.88:1 | Цвет текста затемнён; desktop/mobile/dark Axe повторены без нарушений. |
| Единый сверхбыстрый visual-обход исчерпывал лимит media grants | Полученные 429 записаны; независимые группы layout QA используют существующую изоляцию seed-счётчиков между сценариями. Производственный лимит сохранён. |
| Headless среда не подтверждала Vimeo/YouTube playback | Выделен headed Chrome со штатными media-компонентами; текущий финальный прогон подтверждает >2 секунд и fullscreen для всех 5 исходных провайдеров. |

## Скриншоты

Проверяемые размеры: 375×812, 390×844, 430×932, 768×1024, 1024×768, 1440×900, 1920×1080. Desktop screenshots — 1440×900 viewport; mobile — 390×844. Full-page изображения могут быть выше viewport. Dark — отдельный снимок каждого экрана.

Снимки аналитики повторно сняты с начала неизменённой страницы после проверки клавиатурной прокрутки: [capture evidence](qa/evidence/analytics-capture.json). Это исключает артефакты fixed-элементов вне viewport при full-page capture прокрученной страницы.

| Экран | Desktop | Mobile | Dark |
|---|---|---|---|
| Student Home | [PNG](qa/screenshots/student-home-desktop.png) | [PNG](qa/screenshots/student-home-mobile.png) | [PNG](qa/screenshots/student-home-dark.png) |
| Каталог | [PNG](qa/screenshots/catalog-desktop.png) | [PNG](qa/screenshots/catalog-mobile.png) | [PNG](qa/screenshots/catalog-dark.png) |
| Курс | [PNG](qa/screenshots/course-desktop.png) | [PNG](qa/screenshots/course-mobile.png) | [PNG](qa/screenshots/course-dark.png) |
| Урок | [PNG](qa/screenshots/lesson-desktop.png) | [PNG](qa/screenshots/lesson-mobile.png) | [PNG](qa/screenshots/lesson-dark.png) |
| Login | [PNG](qa/screenshots/login-desktop.png) | [PNG](qa/screenshots/login-mobile.png) | [PNG](qa/screenshots/login-dark.png) |
| Admin Home | [PNG](qa/screenshots/admin-home-desktop.png) | [PNG](qa/screenshots/admin-home-mobile.png) | [PNG](qa/screenshots/admin-home-dark.png) |
| Курсы Admin | [PNG](qa/screenshots/admin-courses-desktop.png) | [PNG](qa/screenshots/admin-courses-mobile.png) | [PNG](qa/screenshots/admin-courses-dark.png) |
| Редактор курса | [PNG](qa/screenshots/course-editor-desktop.png) | [PNG](qa/screenshots/course-editor-mobile.png) | [PNG](qa/screenshots/course-editor-dark.png) |
| Редактор урока | [PNG](qa/screenshots/lesson-editor-desktop.png) | [PNG](qa/screenshots/lesson-editor-mobile.png) | [PNG](qa/screenshots/lesson-editor-dark.png) |
| Пользователи | [PNG](qa/screenshots/users-desktop.png) | [PNG](qa/screenshots/users-mobile.png) | [PNG](qa/screenshots/users-dark.png) |
| Вход в академию | [PNG](qa/screenshots/academy-entry-desktop.png) | [PNG](qa/screenshots/academy-entry-mobile.png) | [PNG](qa/screenshots/academy-entry-dark.png) |
| Регистрация | [PNG](qa/screenshots/register-desktop.png) | [PNG](qa/screenshots/register-mobile.png) | [PNG](qa/screenshots/register-dark.png) |
| Профиль | [PNG](qa/screenshots/profile-desktop.png) | [PNG](qa/screenshots/profile-mobile.png) | [PNG](qa/screenshots/profile-dark.png) |
| Библиотека | [PNG](qa/screenshots/library-desktop.png) | [PNG](qa/screenshots/library-mobile.png) | [PNG](qa/screenshots/library-dark.png) |
| Сохранённое | [PNG](qa/screenshots/saved-desktop.png) | [PNG](qa/screenshots/saved-mobile.png) | [PNG](qa/screenshots/saved-dark.png) |
| Поиск | [PNG](qa/screenshots/search-desktop.png) | [PNG](qa/screenshots/search-mobile.png) | [PNG](qa/screenshots/search-dark.png) |
| Категории | [PNG](qa/screenshots/categories-desktop.png) | [PNG](qa/screenshots/categories-mobile.png) | [PNG](qa/screenshots/categories-dark.png) |
| Медиатека | [PNG](qa/screenshots/media-desktop.png) | [PNG](qa/screenshots/media-mobile.png) | [PNG](qa/screenshots/media-dark.png) |
| Аналитика | [PNG](qa/screenshots/analytics-desktop.png) | [PNG](qa/screenshots/analytics-mobile.png) | [PNG](qa/screenshots/analytics-dark.png) |
| Настройки | [PNG](qa/screenshots/settings-desktop.png) | [PNG](qa/screenshots/settings-mobile.png) | [PNG](qa/screenshots/settings-dark.png) |
| Журнал действий | [PNG](qa/screenshots/audit-desktop.png) | [PNG](qa/screenshots/audit-mobile.png) | [PNG](qa/screenshots/audit-dark.png) |

## Повторение проверки и выпуск

Запустите локальный production-сервер и Supabase, затем `npx playwright test --reporter=list,json`. Для видеосценария нужен Chrome с графической сессией; необязательные `QA_YOUTUBE_URL`, `QA_VIMEO_URL`, `QA_RUTUBE_URL` позволяют проверить свои разрешённые embed-ролики. Без них используются проверенные публичные примеры. Исключать обязательный тест ради зелёного статуса нельзя.

Финальные доказательства: [единый E2E](qa/evidence/e2e-summary.json), [UAT](qa/evidence/uat.json), [видео](qa/evidence/video-providers.json), [основные экраны](qa/evidence/responsive.json), [дополнительные экраны](qa/evidence/responsive-secondary.json), [Linux runtime](qa/evidence/container.json). История ранних ошибок не удаляется; актуальный результат определяется датой финального прогона.

Перед интернет-размещением выполните production SMTP/domain, HTTPS reverse proxy, запрет прямого Node-порта, отдельные credentials и проверку восстановления БД **и** Storage в staging по [OPERATIONS](OPERATIONS.md). Эти действия относятся к отдельному этапу размещения. Текущая поставка: **READY FOR PRODUCTION**.
