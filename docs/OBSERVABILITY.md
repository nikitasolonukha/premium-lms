# Журналирование и мониторинг

`x-request-id` проходит проверку UUID; иначе сервер создаёт новый. Proxy передаёт его серверным обработчикам и возвращает в ответе. Это идентификатор диагностики, не средство авторизации. Оператор сопоставляет его с JSON-событиями `request.failed`, `action.failed`, `media.failed`, `playback.failed`, `readiness.failed`. Ошибки Server Actions возвращают requestId вместе с безопасным сообщением.

Каждое событие содержит timestamp, level, event, requestId и разрешённый тип ошибки. Произвольное сообщение исключения, SQL, stack, тела запросов, email, cookies, Authorization, OTP, callback query, signed URLs и download tokens не отправляются. Это сознательный компромисс: мониторинг показывает класс сбоя и частоту; подробное воспроизведение выполняется локально с тестовыми данными. Не включайте у reverse proxy/access logs query strings и token-сегмент `/api/download/*`.

`/api/ready` проверяет загруженную конфигурацию и настоящий SQL RPC `branding` с publishable key и таймаутом 2,5 секунды. Ответ только `{ "status": "ok" }` или HTTP 503; секретов и версии схемы нет. `/api/health` сохраняет исходный контракт той же проверки зависимости. Настройте внешнюю HTTPS-проверку и уведомление о нескольких последовательных 503.

## Необязательный Sentry

Без `SENTRY_DSN` SDK не инициализируется. С заданным DSN используется закреплённый серверный `@sentry/node`; браузерный SDK, replay, tracing, автоматический сбор сетевых запросов/БД/PII и breadcrumbs отключены. `beforeSend` заново строит событие из разрешённых полей: новые поля SDK не попадают в отчёт автоматически. `SENTRY_ENVIRONMENT` задаёт окружение, безопасные стандартные значения — local/staging/production. `SENTRY_AUTH_TOKEN` не требуется: загрузка source maps в этом профиле отключена. Никогда не задавайте его с `NEXT_PUBLIC_`.

Доставка имеет ограниченный flush 1,5 секунды. Ошибка backend не заменяет исходную ошибку приложения; появляется `monitoring.failed`. DSN обозначает конфигурацию, а не доказательство доставки. В текущем локальном окружении backend **NOT CONFIGURED**. До staging sign-off оператор должен вызвать контролируемое исключение на staging, сопоставить requestId в HTTP/log/Sentry, проверить отсутствие чувствительных полей и получение уведомления. Не добавляйте публичный endpoint для искусственного сбоя.

Контракт SDK проверен по установленным типам версии 11.1.0 (`dataCollection`, `beforeSend`, отключение integrations). Общая документация: [Sentry Node](https://docs.sentry.io/platforms/javascript/guides/node/), [Next instrumentation](https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation).
