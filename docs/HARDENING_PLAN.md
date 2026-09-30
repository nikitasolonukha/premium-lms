# Production hardening — рабочий план

Исходный HEAD: `1cd6f566f82e65363d844390c2f71fe3db9b5e88`. Требования: 40 пунктов задания от 30 сентября 2026. Текущий статус до завершения нового аудита: **NOT READY**. Исторические локальные результаты не являются проверкой staging или production.

## Результаты повторного аудита

Изучены README, ARCHITECTURE, SECURITY, RLS_MATRIX, QA_REPORT, OPERATIONS, все 11 миграций и существующие browser/security/operator tests. Сохраняются RLS, серверная сессия, обязательная MFA сотрудников, разделение черновика и публикации, закрытый Storage и все подтверждённые пользовательские сценарии.

Подтверждённые пробелы: protected video пока только контракт; неполная runtime env validation и доверие IP-заголовку без явного подтверждения оператора; отсутствуют CI/release workflows; нет request correlation/readiness/monitoring; download grant не содержит явных version/audience/purpose; ZIP проверяется по заголовкам без проверки распакованных данных; один размер WebP; analytics возвращает все курсы; прежние тесты перезаписывают evidence. Watermark требует настройки и минимизации персональных данных. Старый статус выпуска слишком широк.

GitHub: права admin подтверждены, secret scanning и push protection уже включены. Защита main и прочие настройки будут проверены и зафиксированы отдельно. Supabase changelog от 25.09.2026: обновление PostgreSQL 15.19/17.11 и возможная переиндексация расширений должны проверяться оператором при обновлении инфраструктуры; изменения схемы этого проекта не заменяют обновление управляемой БД.

## Последовательность

1. Отдельные каталоги QA-прогонов; env, trusted proxy, токены, request ID, журналирование и readiness (7–14, 29, 40).
2. Cloudflare Stream и Mux с проверкой защищённости источника, RSA signing, CMS gating и отрицательными тестами; watermark (1–2, 11, 30).
3. Загрузки, responsive derivatives, session/MFA, audit filters, публикация, пагинация (15–20, 25–26).
4. CI, полный QA, release, зависимости, GitHub protection/security, безопасные артефакты (3–6, 31–32).
5. Backup manifest/verifier, deployment profiles, staging/production UAT, структурный CSS refactor (21–24, 27).
6. Чистая установка и весь локальный regression/security/visual/Docker QA; реальные GitHub workflow runs; отчёты и push (28–29, 33–40).

Новые защитные механизмы проверяются через RED/GREEN. Старые evidence сохраняются без перезаписи; новые идут в `docs/qa/runs/<run-id>/`. Live video без внешних credentials — UNVERIFIED / SKIP_EXTERNAL_CONFIGURATION. Отсутствующая инфраструктура — NOT CONFIGURED. Максимальный итог локальной поставки — CODE READY FOR STAGING, только после выполнения обязательных проверок кода.
