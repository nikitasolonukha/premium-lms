# Staging sign-off

Статус инфраструктуры сейчас: NOT CONFIGURED. Пункты ниже — план проверки, не PASS. Записывайте дату, release SHA, project/domain ID, владельца и evidence для каждого результата. Допустимые исходы: PASS, FAIL, UNVERIFIED, NOT CONFIGURED.

| Проверка            | Доказательство для PASS                                                                                           |
| ------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Изоляция            | Отдельный production-like Supabase, bucket, SMTP и provider QA assets; production data/keys не используются       |
| HTTPS и origin      | Канонический домен, valid TLS, APP_URL/SUPABASE_URL HTTPS, корректные Auth callbacks и redirects                  |
| Env/startup         | Полная schema, безопасный RATE_LIMIT_SECRET; unsafe/partial configuration действительно отклоняется               |
| Миграции            | Чистый проект, все migrations; актуальная RLS_MATRIX, public-only Data API                                        |
| SMTP                | Реальная доставка confirmation/invite/recovery, SPF/DKIM/DMARC, отключённый link tracking                         |
| Владелец/MFA        | Operator bootstrap, email/password, TOTP setup, AAL2; recovery с отзывом всех sessions                            |
| Trusted IP          | Spoofed header не меняет доверенный адрес; proxy перезаписывает выбранный header; обход Node закрыт               |
| Auth                | Registration, confirmation, login/logout/history, reset/password replacement, refresh, disabled/revoked sessions  |
| Staff session       | Idle/absolute deadlines, warning и explicit continuation; фоновый poll не продлевает session                      |
| CMS/UAT             | Новый курс, все 11 block types, save/reload/conflict, Editor draft, atomic Admin publish, assignment              |
| Access/sequence     | A allowed/B denied, unpublished/locked/archived content, search/counters/saved/library не раскрывают контент      |
| Private media       | Real upload/download, formats, variants, 60s file/300s image expiry, revoke/new grant denial                      |
| Protected video     | Реальный Cloudflare/Mux CMS → playback starts → B denied → revoke → token expires; public asset обход отсутствует |
| Watermark           | Masked ID/email, movement/opacity/interval, controls и Academy fullscreen; ограничения native/PiP документированы |
| CSP/security        | Headers, no hydration/console faults, no unexpected external origins, CSRF/mutation/RPC bypass tests              |
| Lists/performance   | Большой набор пользователей/курсов/media/audit, bounded pagination, SQL plans, без N+1                            |
| Visual/a11y         | 15 основных экранов desktop/mobile/light/dark, все семь размеров, keyboard/focus/reduced motion                   |
| Monitoring          | Контролируемый error, request UUID, sanitized JSON/Sentry и реальное уведомление                                  |
| Backup/restore      | Quiesced manifest, hash/count, отдельный restore rehearsal, target DB/Storage verifier, RPO/RTO                   |
| Deployment/rollback | Проверенный профиль, предыдущий image/release, совместимые forward migrations, rollback rehearsal                 |

PASS всех обязательных строк без Critical/High позволяет **READY FOR PRODUCTION DEPLOYMENT**. Локальные зелёные tests дают максимум CODE READY FOR STAGING. Финальное production подтверждение выполняется по PRODUCTION_UAT.md.
