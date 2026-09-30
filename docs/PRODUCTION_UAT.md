# Production infrastructure UAT

Сейчас production domain/SMTP/provider/monitoring/deployment: NOT CONFIGURED. Таблица заполняется после фактического запуска на утверждённом release SHA и успешного staging sign-off.

| Сценарий            | Проверка и evidence                                                                                                          |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Release provenance  | Tag/commit/image digest, прошедшие required CI checks и staging sign-off                                                     |
| Сеть и конфигурация | HTTPS domain, Secure/HttpOnly/SameSite cookies, exact callbacks, CSP/HSTS, no origin bypass                                  |
| Доставка почты      | Confirmation, invite и recovery доставлены реальным QA ящикам; redirects/expiry работают                                     |
| Owner и доступы     | Admin MFA, staff без AAL2 denied, A/B тестовые аккаунты с разными enrollments                                                |
| Новый курс          | Admin создаёт курс/модуль/урок, текст/video/image/PDF, publish и assignment через UI                                         |
| Обучение            | A проходит урок, скачивает PDF, завершает и продолжает после logout/login; B denied pages/media/playback/RPC                 |
| Черновик            | Editor меняет draft; Student продолжает видеть прежнюю публикацию до Admin publish                                           |
| Отзыв               | Disable/revoke session/access прекращает новые private grants и mutations; уже выданный grant действует только до TTL        |
| Protected stream    | Реальное playback, signed-only source, expiry, renewal/revoke; secrets не находятся в браузере                               |
| Эксплуатация        | Health/readiness, request correlation, sanitized monitoring alert, backup job и restore evidence                             |
| Нагрузка и UX       | Bounded lists, целевые latency/error budgets, основные mobile/desktop сценарии, отсутствие console/hydration/overflow faults |
| Rollback            | Возврат к проверенному image с совместимой схемой, без потери uploads/progress/enrollments                                   |

Фиксировать только безопасные screenshots и IDs результатов, без password/OTP/tokens/signed URLs. Созданные QA данные очистить через UI/операторскую процедуру с сохранением необходимого audit. **PRODUCTION VERIFIED** допустим лишь после PASS всех обязательных строк и отсутствия Critical/High; любое отсутствующее доказательство остаётся UNVERIFIED.
