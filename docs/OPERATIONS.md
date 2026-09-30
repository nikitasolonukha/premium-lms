# Развёртывание и эксплуатация

## До первого выпуска

Публикация в интернете не входит в локальную поставку. Локальные проверки могут подтвердить только **CODE READY FOR STAGING**. После реального staging UAT возможен **READY FOR PRODUCTION DEPLOYMENT**, после deployment и production UAT — **PRODUCTION VERIFIED**. Непройденные обязательные проверки означают **NOT READY**. Production использует отдельный Supabase project, отдельные Storage и SMTP; локальные seed-аккаунты туда не переносятся.

1. Подготовьте Supabase PostgreSQL 17 / Auth / Storage, включите `pg_jsonschema`. API schemas: только public; private не экспонировать. Примените **все миграции по порядку** через управляемый migration job с PostgreSQL operator credentials. Не запускайте destructive reset на production.
2. Настройте Auth Site URL на канонический HTTPS origin приложения; redirect allowlist — точный `/auth/callback` (и согласованные recovery redirect варианты). Включите email confirmation и TOTP. JWT lifetime выберите в соответствии с нагрузкой и моделью риска; staff timeout дополнительно проверяет сама БД.
3. Настройте рабочий SMTP: host, port, TLS, отдельные credentials, подтверждённый отправитель. Настройте SPF/DKIM/DMARC у почтового домена. Перенесите шаблоны из `supabase/templates`: ссылки должны вести на ваш APP_URL, передавать token_hash в **серверный** callback, а не помещать access/refresh tokens во fragment браузера. Проверьте confirmation, recovery и invite на реальном тестовом ящике до открытия регистрации.
4. Разверните Next.js на Node 22+ либо в контейнере. Передайте `APP_URL`, `SUPABASE_URL`, publishable key, server secret key и случайный `RATE_LIMIT_SECRET` минимум 32 байта. Ни одна из них не имеет префикса NEXT_PUBLIC. DATABASE_URL нужен операторским командам, но не Node-приложению.
5. За reverse proxy настройте HTTPS, лимиты тела, timeouts для uploads/download streaming и доверенный IP header. Перезаписывайте выбранный header, не принимайте его от клиента; закройте публичный обход Node-порта. Cookie Secure включается по APP_URL HTTPS. Согласуйте CSP frame allowlist через настройки Admin.
6. Создайте первого владельца: `npm run admin:create -- create owner@example.com`. Команда не публикует пароль, отправляет invite и назначает первого Admin. Владелец подтверждает email, создаёт пароль и включает TOTP через интерфейс. Последующих сотрудников назначает Admin после MFA.
7. Пройдите staging UAT с SMTP и вашим доменом, проверьте `/api/health`, cookies, callback, MFA, signed grants, backup/restore. Только затем направляйте пользовательский трафик.

## Сборка и контейнер

## Профиль A: Vercel + Supabase

Создайте отдельные Supabase projects для staging и production. На Vercel используйте Node 22, `npm ci`, `npm run build`; миграции выполняет отдельный operator job до promotion. Preview deployments не получают production credentials и не запускают production seed. Зафиксируйте один HTTPS origin для staging: каждый случайный preview URL не добавляется в Auth allowlist.

В Environment Variables задайте серверные `DEPLOYMENT_ENV=staging`/`production`, `APP_URL`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, случайный `RATE_LIMIT_SECRET` и выбранные интеграции. Применяйте отдельные значения к Preview/Production; серверу не нужен `DATABASE_URL`. Значения signing PEM сохраняются как multiline secret или base64 PEM. При изменении env создайте новый deployment; проверьте `/api/ready` и provider configuration audit. Для Sentry задайте DSN и окружение, затем подтвердите доставку безопасного тестового события в реальный backend.

По документации Vercel перезаписывает `x-forwarded-for`. Здесь предпочтителен `TRUSTED_IP_HEADER=x-vercel-forwarded-for`, который также устанавливает платформа. **До** `TRUSTED_PROXY_ACKNOWLEDGED=true` отправьте извне запросы с поддельными значениями обоих headers и подтвердите, что выбранный header определяется платформой. При дополнительном CDN/proxy требуется собственная проверенная цепочка доверия; в неподтверждённой конфигурации header оставьте пустым. Подтвердите HTTPS callbacks, Secure cookies, SMTP, закрытые Storage buckets, CSP и реальное видео по [staging checklist](STAGING_CHECKLIST.md). Этот профиль документирован, deployment здесь не выполнен.

## Профиль B: Docker + reverse proxy + Supabase

Собирайте Dockerfile из проверенного commit с OCI `VERSION` и `REVISION`; фиксируйте полученный digest и promote тот же image между окружениями. Runtime работает от UID 1001. Передавайте env через secret store/закрытый env-файл, read-only root filesystem и writable `/tmp`; порт 3000 доступен только reverse proxy. Контейнер приложения не требует operator DATABASE_URL. Сборка не получает runtime secrets.

Proxy завершает TLS и принудительно заменяет выбранный IP header. Для одного Nginx edge, принимающего соединения непосредственно от клиента, конфигурация включает `proxy_set_header X-LMS-Client-IP $remote_addr;`, `proxy_set_header Host $host;` и `proxy_set_header X-Forwarded-Proto https;`. Задайте `TRUSTED_IP_HEADER=x-lms-client-ip` и включайте ACK только после проверки подделанного header и закрытия прямого доступа к Node. `$remote_addr` за CDN обозначает CDN: сначала настройте точные доверенные адреса `real_ip`, затем повторите spoof test. Не используйте входящий `X-Forwarded-For` без проверки.

Настройте upload body limit 50 MiB (в приложении форматы имеют собственные меньшие пределы), ограниченные proxy/read timeouts для streaming и запрет кэширования `/api/media`, `/api/playback`, `/download`, Auth и учебных маршрутов. Не логируйте query strings, download token path или Authorization. Readiness проверяет БД за ограниченное время и возвращает 503 при отказе; это не отдельная проверка живости процесса. Автоматическая перезагрузка должна учитывать отказ внешней БД и избегать restart storm. Read-only runtime и отказ небезопасной env проверяются в CI; SMTP/домен/внешний proxy требуют отдельного UAT.

Для обоих профилей используйте [manifest и read-only backup verifier](BACKUP_RESTORE.md), [staging checklist](STAGING_CHECKLIST.md) и [production UAT](PRODUCTION_UAT.md). Резервная копия БД не содержит байты Storage. Опубликованный курс и приватные объекты проверяются вместе после восстановления.

Источники: [Vercel request headers](https://vercel.com/docs/headers/request-headers), [Vercel environment scopes](https://vercel.com/docs/environment-variables/manage-across-environments), [Supabase production checklist](https://supabase.com/docs/guides/deployment/going-into-prod).

## Локальная сборка

```powershell
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm run start
```

Dockerfile собирает standalone output и запускает Node от непривилегированного пользователя. `.dockerignore` исключает env, локальные аккаунты, тестовые результаты и node_modules. Build secrets не копируются в образ. Runtime secrets передаются оркестратором через environment/secret store. Локальный production QA использует `npm start`: скрипт копирует public/static в standalone и запускает его server.js. По умолчанию bind — 127.0.0.1; `LMS_HOST=0.0.0.0` используйте только за настроенным reverse proxy. Сам Docker deployment требует отдельной проверки на целевом хосте.

Исторический локальный Linux-образ исходной поставки после исправлений Uploader и доступности интерфейса собран при остановленном Supabase LMS и проверен командой `node scripts/test-container.mjs`: UID 1001, health с настоящей восстановленной локальной БД, публичная страница 200 и отсутствие `.env.local` в образе. Дата и digest — в [container.json](qa/evidence/container.json). QA-контейнер использует только loopback-порт 3001; его остановка и удаление временного env-файла подтверждены до записи PASS. Предыдущая попытка сборки вызвала OOM; диагностика сохранена в [инциденте](qa/evidence/runtime-incident.json).

Smoke-скрипт ограничивает каждый Docker-запрос 30 секундами, HTTP — 3–5 секундами и записывает PASS только после успешной очистки контейнера и временного env-файла. При таймауте `run` он пытается остановить контейнер с уникальным именем своего запуска: команда могла успеть создать его на сервере. При недоступном Engine stop также может не выполниться; скрипт завершится ошибкой, сохранив предыдущий результат с его датой. После восстановления проверьте оставшийся контейнер по имени из ошибки; не удаляйте чужие контейнеры или volumes. Файл `.local/docker-runtime.env` удаляется и при ошибке stop. Имитационные unit-тесты этих отказов не заменяют реальный smoke.

Сборка использует два workers и 512 MiB Node heap, но это не ограничение суммарной памяти всех процессов. На проверенном локальном хосте примерно 2 GiB памяти Docker VM оказалось недостаточно для сборки вместе с работающими контейнерами. Перед повтором остановите только локальный Supabase LMS с сохранением данных и проверьте свободные ресурсы. Не запускайте сборку одновременно с browser QA. Изменение общей памяти Docker и остановка других проектов требуют решения владельца среды; универсальный достаточный объём памяти этим аудитом не установлен.

## Журналы, здоровье, лимиты

`GET /api/health` проверяет доступность БД через узкий branding RPC и возвращает 200/503 без деталей конфигурации. Проверяйте ошибки 5xx, частоту 429, latency SQL, свободное место, недоставленные письма и незавершённые загрузки. Не выводите URL-параметры callback, token-сегменты download, подписанные Storage URL, пароли, OTP, cookies и authorization headers в proxy/APM.

Admin audit хранится в БД. Экспортируйте его в защищённый архив по согласованному сроку хранения; обычные пользователи не могут изменять записи. Старые rate-limit buckets можно удалять операторской командой по `window_start`, сохраняя действующие окна. Подключать автоматизацию на машине владельца без отдельного запроса не требуется.

`npx tsx --env-file=<operator-env> scripts/cleanup-media.ts` обрабатывает до 100 pending/rejected upload intents старше 24 часов. Нужны operator DATABASE_URL, SUPABASE_URL и SUPABASE_SECRET_KEY. Advisory lock исключает параллельную очистку; объект сначала помечается rejected, после удаления оригинала и варианта — deleted. При сбое Storage повторите запуск: rejected будет выбран снова. Ready assets не выбираются. Для регулярного запуска используйте задачу вашего deployment-окружения. Ошибки Storage должны попасть в операторский мониторинг, без URL и ключей.

## Резервное копирование

Резервная копия БД и копия файлов Storage — **два отдельных набора**. Запись `storage.objects` не содержит байты файла. Включите штатные backups/PITR у провайдера в зависимости от допустимых RPO/RTO. Для переносимых резервных копий используйте PostgreSQL `pg_dump` совместимой версии с отдельным operator/service account; параметры соединения передавайте через защищённый pg_service/.pgpass или environment, не сохраняйте пароль в shell history.

- Снимок схемы/данных приложения, Auth и метаданных Storage должен быть согласован по времени. Штатные managed-схемы восстанавливаются по процедуре Supabase; не перезаписывайте произвольно владельцев, системные роли и расширения.
- Объекты `academy-private` копируются через S3-compatible или Storage API сервисной учётной записью с сохранением **полного object key**, MIME и checksum. Включите оригиналы и подготовленные `.webp` варианты. Названия ключей не заменяйте пользовательскими filename.
- Храните manifest: timestamp, migration version, перечень buckets, object count, bytes, SHA-256 и версию приложения. Шифруйте копии, ограничьте доступ, храните вне рабочего хоста и тестируйте восстановление.
- Не считайте успешный `pg_dump` доказательством сохранности файлов. Проверяйте скачивание выборки и сверку manifest.

## Восстановление

1. Откройте отдельное изолированное staging-окружение той же поддерживаемой версии PostgreSQL/Supabase. Остановите записи приложения на время согласованного восстановления.
2. Восстановите БД по инструкции провайдера, затем Storage objects с теми же ключами; сверяйте count/hash. Проверьте grants/RLS и API schemas.
3. Сверьте миграции и код. Если восстанавливается более ранний снимок, сначала откатите приложение к совместимому release, затем применяйте только проверенные forward migrations. Не выполняйте автоматический destructive down migration.
4. Отзовите старые Auth-сессии, если это инцидент безопасности или восстановление требует исключить устаревшие access state. Проверьте вход владельца и TOTP. Используйте операторский MFA recovery только после проверки личности.
5. Пройдите UAT: restricted course A/B, опубликованная редакция, скачивание, signed expiry, прогресс, audit. Зафиксируйте фактические RPO/RTO и результат восстановления. Только после проверки переводите трафик.

## Выпуски и rollback

Перед миграцией сделайте backup и проверьте его доступность. Сначала совместимые расширяющие миграции, затем код; удаление/переименование колонок — отдельный выпуск после перехода всех readers. Версии npm и lockfile обновляйте контролируемо, проверяя security advisories и полный QA. При отказе кода верните предыдущий образ; данные не откатывайте вслепую. Не меняйте старые уже применённые миграции.

## Локальные особенности

Supabase CLI и Docker требуют доступа к Docker Desktop named pipe на Windows. Если start зависает при здоровой БД, не удаляйте volumes и не используйте `docker system prune`: сначала соберите диагностику только контейнеров `premium-lms-local`, остановите этот проект с сохранением backup и проверьте поддерживаемую версию CLI. Не запускайте несколько start одновременно. Локальный Mailpit не отправляет письма внешним адресатам.

При повторном OOM сначала восстановите доступность Engine, учитывая другие проекты общего Docker Desktop. Затем запустите существующий стек LMS с прежними volumes, без `db reset` и без seed. Проверьте `/api/health`, вход Admin с MFA, наличие курса из последнего [UAT](qa/evidence/uat.json), его опубликованных уроков, прогресса Student A и фактическое скачивание изображения/PDF. Для сохранённого UAT-набора используйте `npx tsx --env-file=.env.local scripts/test-recovery.ts`: он требует прежний `uat.json`, `.local/seed-accounts.json` и оригинальный `.local/uploads/План практики UAT.pdf`. Этот сценарий прошёл после инцидента: [runtime-recovery.json](qa/evidence/runtime-recovery.json). Это выборочная проверка сохранности, а не полная сверка всех объектов Storage. Затем выполните новый Linux build при достаточных ресурсах и `node scripts/test-container.mjs`.

## Текущее QA-ограничение хоста

30 сентября 2026 в предыдущем browser-прогоне local ready вернул 503, Auth health connection failed и Engine API 500; причина не установлена. Агент не перезапускал общий Docker/WSL. После восстановления Engine понадобился перезапуск только контейнеров Kong/PostgreSQL/Mailpit LMS из-за stale host port forwarding. Последние runtime probes HTTP 200, чистый local E2E 47 PASS/0 FAIL/2 UNVERIFIED, актуальные Docker build/actual-DB smoke и backup после 17 migrations PASS: [QA_REPORT](QA_REPORT.md), [RELEASE_READINESS](RELEASE_READINESS.md). Для shared restart согласуйте операторское окно; не останавливайте чужие контейнеры и не удаляйте volumes.
