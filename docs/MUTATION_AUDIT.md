# Mutation guards — 30 сентября 2026

Проверена вся поверхность `src/lib/actions/*.ts` и `src/app/api/**/route.ts`. Обычные изменения БД выполняются с пользовательским JWT через узкие RPC; прямые INSERT/UPDATE/DELETE grants отсутствуют. TypeScript сам по себе не считается проверкой входных данных. Реальные grants/policies и EXECUTE permissions: [RLS_MATRIX](RLS_MATRIX.md).

| Операции | Origin / identity | Валидация и серверный барьер |
|---|---|---|
| `signIn`, `register`, `requestPasswordReset` | Точный same origin; анонимность предусмотрена Auth flow | Zod email/password/name; account/IP limits; Supabase Auth. HTTP adapter ограничивает фактический JSON stream до 4096 bytes и deadline, rejects invalid UTF-8/JSON. |
| `changePassword`, `updateProfile`, `signOut` | same origin; текущий пользователь для изменений профиля/пароля; logout завершает собственную сессию | Password/profile schemas, Supabase Auth и `update_profile`; owner/avatar проверяются в БД. |
| `enrollMfa`, `verifyMfa` | same origin; подтверждённый пользователь; AAL1 разрешён для настройки/повышения assurance | UUID factor, шестизначный OTP, Supabase challenge/verify; staff AAL1 не получает административные права. Student может подключить MFA добровольно. |
| `saveCourse`, `duplicateCourse` | `assertStaffAction`: email, DB role, AAL2, настоящий live session и staff deadlines | Course/block schema, безопасные URL/provider IDs, semantic validation и optimistic version в RPC. Duplicate создаёт независимый draft. |
| `publishCourse`, `deleteCourse` | Admin guard, same origin и AAL2 | UUID/version, Admin RPC, атомарная публикация/логическое архивирование, audit/rate. |
| `setAccess`, `setRole`, `disableUser` | Admin guard, same origin и AAL2 | Strict UUID/role/access schemas, RPC checks, unique enrollment, last active Admin lock; disabled-user sessions отзываются. |
| `recordProgress`, `saveItem` | `assertUserAction`, same origin и live session | UUID/seconds schema, PostgreSQL boolean arguments; RPC повторно проверяет published course/lesson access и sequence. Completion идемпотентен. |
| `updateSettings`, `mutateCategory`, `deleteMedia` | Admin guard, same origin и AAL2 | Strict settings/category/UUID schema, media usage guard, audit/rate. Editor не может изменить эти сущности напрямую. |
| `assignmentOptions`, `courseFilterOptions` | Admin guard, same origin и AAL2 | Strict bounded search/page/UUID schema; это чтение, но guard сохраняется. Bounded catalog и batched enrollments/grants. |
| `inviteUser` | Admin guard, same origin и AAL2 | Strict email/name schema, user rate limit; privileged Auth invite только после проверок. Приглашение выдаёт Student. |
| `createUpload` | User guard, same origin; Student только avatar | Strict ID/name/MIME/bytes/purpose schema; `create_media` требует staff/AAL2 для учебных файлов и Admin для branding. После RPC сервер выдаёт ограниченный upload permission. |
| `finalizeUpload` | User guard, same origin; owner; для course/branding staff/Admin | UUID, pending/status/size checks, ZIP/PDF/image inspection, variants/scanner; service-only finalization RPC повторно проверяет actual session ID, role, deadlines и ownership. |
| `continueStaffSession` | Staff guard, same origin и AAL2 | Явное действие пользователя, rate limit; абсолютный deadline не продлевается. Read-only polling `GET /api/staff-session` не touch-ит session. |
| `checkVideoProvider` | Admin guard, same origin и AAL2 | Provider enum/config completeness, rate; ограниченный server-to-provider запрос без произвольного адреса. Config fingerprint audit содержит HMAC, не секреты. |

Server Actions имеют Next.js body limit 2 MiB. Upload bytes идут напрямую в закрытый Storage по ограниченному разрешению и проверяются сервером при finalize. Auth HTTP POST adapter повторно вызывает те же guarded actions; origin проверяется до выполнения изменений, bounded parser ограничивает работу с телом запроса.

GET endpoints имеют отдельные контракты: media/playback требуют живую пользовательскую сессию, access/revision/sequence и rate; download принимает ранее выданный 60-second bearer grant с version/audience/purpose и проверяет подпись/expiry. Его продолжение до TTL после revoke ожидаемо. Public branding выдаёт только выбранные подготовленные brand assets. Health/ready возвращают ограниченный результат DB/config probe. Эти GET не позволяют создавать enrollment, менять роли или публиковать контент.

Негативные проверки: direct RPC/table/Storage attempts, Student B identifiers, Editor publication/settings/roles/access, staff AAL1, revoked/disabled sessions, draft/sequential/archived assets, CSRF, malformed body и rate counters. Актуальные результаты и точные границы — в [QA_REPORT](QA_REPORT.md). Привилегированный ключ отсутствует в клиентских bundles; отдельные server-only операции не заменяют пользовательский RLS для обычных запросов.
