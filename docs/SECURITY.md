# Защита и модель угроз

Ученик и Editor считаются потенциально недоверенными клиентами. Скрытая кнопка не является проверкой полномочий. Проверки проходят в приложении и в PostgreSQL; прямые REST/RPC/Storage запросы включены в QA.

## Сессии и MFA

Сессией владеет сервер. Auth cookies: HttpOnly, SameSite=Lax, Secure при HTTPS. Runtime Zod schema требует HTTPS для APP_URL и Supabase в staging/production, проверяет origin, случайный секрет и полные наборы интеграционных credentials. Standalone entrypoint выполняет ту же валидацию до listen, включая Docker. Прокси обновляет сессию, переносит обновлённые cookies в запрос и ответ. Чтение пользователя подтверждается Auth, а RLS сверяет настоящий JWT `session_id` с `auth.sessions` и состоянием профиля.

Editor/Admin требуют подтверждённый email, verified TOTP factor и AAL2. `private.admin_sessions` привязана FK к реальной Auth-сессии. Абсолютный срок — 12 часов от исходной сессии, бездействие — 30 минут. Refresh JWT не сбрасывает часы. Истёкшую сессию нельзя оживить вызовом touch; нужен новый вход. Удалённая Auth-сессия теряет доступ в БД даже при ещё не истёкшем JWT. Supabase тарифные настройки длительности не являются единственной защитой.

Повышение Student → Admin не освобождает от настройки TOTP: следующий вход направляет на MFA, Admin RPC с AAL1 отклоняется. UI предупреждает за две минуты до idle/absolute deadline; чтение статуса не продлевает сессию. Продолжение требует явного действия. [Staff security](STAFF_SECURITY.md) и `session-security.spec.ts` проверяют pages, новые media/playback grants и отправку уже открытой формы после disabled/revoked session.

Пароли, OTP, QR-secret и токены не пишутся нашим приложением в журнал. Dev Server Function logging Next.js явно отключён. Reverse proxy / APM должны исключать query strings `/auth/callback`, весь token-сегмент `/api/download/*`, тела auth-запросов, Cookie/Authorization/Set-Cookie, подписанные Storage URL. Playwright network traces отключены; тестовые секреты находятся только в игнорируемом `.local/`.

## Полномочия

Источник роли — `public.user_roles`, не `raw_user_meta_data`. Student изменяет только профиль, сохранённое и прогресс через узкие RPC. Editor работает с черновиками и материалами. Admin публикует, назначает доступ, управляет ролями и настройками. Изменение роли отзывает административную сессию. Отключение аккаунта удаляет его Auth-сессии. Последний действующий Admin защищён сериализованной проверкой с advisory lock; изменение роли уже отключённого Admin и повторное disable не блокируются этой проверкой. Audit actor references сохраняются, административные аккаунты не удаляются физически через UI.

На таблицах приложения включён RLS. Обычным authenticated выдан SELECT и EXECUTE только необходимых функций; прямые INSERT/UPDATE/DELETE отсутствуют. Public RPC — SECURITY INVOKER; привилегированные реализации находятся в неэкспонируемой `private` schema, имеют пустой search_path и проверяют полномочия. PUBLIC EXECUTE запрещён как для существующих функций, так и глобально для новых default privileges. Service-only функции не доступны authenticated/anon. Полная проверяемая матрица — `RLS_MATRIX.md`.

## Контент и файлы

Учебный bucket `academy-private` закрыт. Политик Student на `storage.objects` нет: пользователь не может сам скачать или подписать объект через Storage API. Выдача проверяет пользователя, опубликованную редакцию, доступ к курсу, доступность урока и media reference.

- Изображение: подготовленные при finalize WebP small/medium/large до 480/960/1800 px, signed URL до 300 секунд, `no-store`, без общего Next Image optimizer. API принимает только enum `size`, произвольный width отклоняется; on-demand image processing отсутствует.
- Скачать файл: разрешение на конкретный asset до 60 секунд; UTF-8 имя в `Content-Disposition`, streaming без общего кэша.
- Отзыв доступа прекращает выдачу новых ссылок. Ранее выданная ссылка может действовать до TTL. Уже скачанную копию технически отозвать нельзя.
- Upload: один случайный object key, без overwrite; pending не становится учебным контентом до проверки. Размер до 50 MiB, avatar/branding до 5 MiB, допустимые расширения и MIME проверяются вместе.
- Проверяются сигнатуры, структура PDF/ZIP/OOXML, traversal, макросы OOXML, количество/распакованный размер архивных записей; изображения дополнительно декодируются и перекодируются Sharp с лимитом пикселей.

ZIP проверяется по фактически распакованным потокам и CRC, а не только заголовкам; лимиты включают байты, коэффициент, число записей и deadline. PDF с active actions, JavaScript, XFA, embedded content и неподдерживаемыми скрытыми object streams отклоняется. Это **не антивирусная сертификация произвольных документов**. `MalwareScanner` имеет disabled и external HTTPS gateway: disabled возвращает SKIPPED / NOT CONFIGURED, external проверяет digest и clean verdict до `ready`; недоступный/невалидный ответ не допускает публикации файла. Реальный scanner backend здесь не подключён. Подробные границы — [UPLOAD_SECURITY](UPLOAD_SECURITY.md). Учебные файлы загружают MFA-подтверждённые сотрудники; Student может загрузить только собственный avatar-изображение.

Публичные logo/favicon выдаются только для двух asset IDs, явно назначенных Admin в бренде; произвольного публичного media lookup нет. Курс, использующий файл, и настройки/профиль защищают его от удаления.

## Видео и watermark

YouTube/Vimeo/Rutube/direct/embed являются публичными источниками: LMS ограничивает доступ к уроку, но не обещает защиту внешнего потока. Embed требует HTTPS и точный разрешённый origin. Произвольный HTML не принимается. Реализованы серверные RS256 adapters Cloudflare Stream и Mux: проверяют источник через фиксированный API origin, требуют signed-only playback и выдают 180-секундное разрешение после проверки access/session/published/sequence/rate limit. Перед подписью доступ проверяется повторно после provider I/O. Клиент обновляет grant с сохранением позиции; denial убирает плеер. Без credentials CMS не показывает провайдер подключённым. Live playback этих двух сервисов остаётся UNVERIFIED / SKIP_EXTERNAL_CONFIGURATION до реального QA; [PROTECTED_VIDEO](PROTECTED_VIDEO.md) описывает provisioning и ограничения.

Watermark выключен по умолчанию. После включения отображает идентификатор зрителя поверх контейнера видео/изображения, меняет положение каждые 18 секунд и не принимает pointer events. Fullscreen запрашивается для нашего контейнера, чтобы знак оставался внутри. Внешний native fullscreen / picture-in-picture, скриншоты, запись экрана и скачанные файлы имеют ограничения; watermark не является DRM. При reduced motion положение остаётся неподвижным.

## Валидация и браузер

Строгий Zod, максимальные длины и размеры, ограничение рекурсивного Rich text. JSON Schema повторно проверяет документ в SQL RPC; отдельная проверка запрещает опасные URL и несогласованные видеоисточники. TipTap выводится через разрешённые React-элементы без `dangerouslySetInnerHTML`.

CSP использует nonce и strict-dynamic; frame-ancestors='none', object-src='none', base-uri='self', form-action='self'. Настроены Referrer-Policy, Permissions-Policy, nosniff и HSTS на HTTPS. Server Actions дополнительно проверяют Origin; same-origin auth endpoints возвращают 403 для чужого Origin. Redirect допускает только безопасный локальный маршрут. Auth callback токен обменивается сервером, не хранится в browser JS.

## Rate limiting

Атомарные PostgreSQL counters: вход 10/10 минут на HMAC аккаунта, восстановление 3/час, поиск 60/мин на пользователя, file/playback grants 30/мин, admin mutations 120/мин. Дополнительный лимит IP включается через `TRUSTED_IP_HEADER` **только за прокси, который перезаписывает заголовок**. На production зафиксируйте этот заголовок и закройте обход прямым доступом к Node-порту. Дополнительно действуют ограничения Supabase Auth.

HTTP endpoints возвращают 429 и Retry-After. Внутри Server Action протокола retryAfter передаётся типизированным результатом. Узкие DB mutations и поисковые RPC сами проверяют лимиты, чтобы прямой RPC не обходил приложение. Счётчики — в private schema, пользователи не могут очищать их.

## Audit и восстановление MFA

Request ID проверяется как UUID; журналы приложения содержат только фиксированный event/type/time/request ID. Опциональный server Sentry заново формирует безопасный payload через beforeSend, без cookie/body/query/stack/user data. Доставка в Sentry backend не подтверждена без DSN. `/api/health` и `/api/ready` проверяют БД с timeout и возвращают 503 при отказе; provider credentials не раскрываются. Административный audit имеет фильтры action/actor/entity/date и сервисную запись изменения provider configuration через HMAC fingerprint без ключей в metadata.

Audit заполняют доверенные SQL-операции: actor, action, entity, безопасные metadata, timestamp. Чтение доступно только Admin; публичных команд изменения/удаления нет. Operator bootstrap/recovery записываются отдельно с `actor=null`, что явно отличает их от UI.

MFA recovery выполняет оператор после внешней проверки личности владельца: `npm run admin:create -- recover-mfa owner@example.com --confirm=owner@example.com`. Команда требует отдельного DATABASE_URL и secret key, сначала отзывает все сессии, затем удаляет факторы. Следующий вход требует подключения нового TOTP. Никогда не добавляйте «аварийный пароль» или публичный recovery endpoint.

При подозрении на утечку: отозвать затронутые сессии, сменить секреты, проверить audit, ротацию инфраструктурных ключей выполнить через Supabase; заново выпустить сборку при изменении её секретов. Не публиковать `.env.local`, `.local`, резервные копии Auth и Storage или test-results.

## Повторный mutation и RLS аудит

Полная поверхность actions/HTTP и предусмотренные Auth/bearer исключения описаны в [MUTATION_AUDIT](MUTATION_AUDIT.md). Migration 17 кеширует только независимые от строки STABLE staff/session predicates в пределах SQL statement; row-dependent course/revision/lesson/media checks и grants сохранены. Свежий запрос повторно проверяет actual session/access. Реальные negative RPC/Storage и revoked/disabled/MFA suites прошли после изменения.
