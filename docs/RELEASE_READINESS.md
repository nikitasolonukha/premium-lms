# Release readiness — 30 сентября 2026

Дополнение по пяти новым функциям: локальные UAT/защита/вшивание названия прошли; Telegram token и реальный production delivery не подключены. [Актуальный QA scope](QA_REPORT.md#дополнение-операционная-админка-и-собственные-видео), [настройка](ACADEMY_OPERATIONS.md). Собственные uploaded MP4 теперь получают **фактически вшитую** надпись; ниже сохранён предыдущий baseline, который этой реализации не включал.

**NOT READY.** Code SHA: `45cf002bfa4998de02402038138d6e5037fbf609`. Local E2E 47 PASS / 0 FAIL / 2 UNVERIFIED; static/DB/security/actual-DB Docker smoke and fresh backup PASS. Core CI PASS, Full QA FAIL on YouTube authorization requirement. No staging/production verification.

Эта таблица фиксирует полный baseline указанного SHA. Последующие overlay и операционная админка имеют отдельные [QA scope](QA_REPORT.md#дополнение-надпись-на-видео-заказчика) и [актуальный uploaded MP4 scope](QA_REPORT.md#дополнение-операционная-админка-и-собственные-видео). Новые проверки не означают повтор всего baseline. Общее название теперь вшивается в MP4; текст и скачивание настраиваются при загрузке. Решения заказчика по постоянному тексту и политике скачивания пока открыты.

| Area | Status | Evidence |
|---|---|---|
| Code build | PASS | [static-checks](qa/runs/2026-09-30-final-regression-04/evidence/static-checks.json) |
| Unit | PASS | 78 tests, scoped 16-module coverage; [static-checks](qa/runs/2026-09-30-final-regression-04/evidence/static-checks.json) |
| DB tests | PASS | [database-checks](qa/runs/2026-09-30-final-regression-05/evidence/database-checks.json); 17 empty migrations / 5 invariant groups |
| Security | PASS | [security-api](qa/runs/2026-09-30-final-regression-05/evidence/security-api.json), [playback-access](qa/runs/2026-09-30-final-regression-05/evidence/playback-access.json) |
| E2E | PASS | 47 local PASS / 0 FAIL / 2 live protected UNVERIFIED; [playwright-summary](qa/runs/2026-09-30-final-regression-05/evidence/playwright-summary.json) |
| Auth | PASS | [auth](qa/runs/2026-09-30-final-regression-05/evidence/auth.json); local Mailpit only |
| MFA | PASS | [mfa-promotion](qa/runs/2026-09-30-final-regression-05/evidence/mfa-promotion.json); 11 bootstrap/recovery checks |
| RLS | PASS | [RLS_MATRIX](RLS_MATRIX.md); actual direct API/RPC negatives |
| Storage | PASS | [media-formats](qa/runs/2026-09-30-final-regression-05/evidence/media-formats.json) |
| Protected files | PASS | [file-expiry](qa/runs/2026-09-30-final-regression-05/evidence/file-expiry.json), [image-variants](qa/runs/2026-09-30-final-regression-05/evidence/image-variants.json) |
| Public video | PASS | [video-providers](qa/runs/2026-09-30-final-regression-05/evidence/video-providers.json); local real Chrome. GitHub YouTube FAIL in CI row. |
| Protected video | UNVERIFIED | API/RS256/contracts/access code PASS; live credentials NOT CONFIGURED |
| CI | FAIL | Core 13/13 PASS; Full 46 PASS/1 FAIL/2 UNVERIFIED; [actual CI](qa/runs/2026-09-30-github-head-45cf002/evidence/run.json) |
| Branch protection | PASS | [actual API](qa/runs/2026-09-30-github-protection-01/evidence/github-protection.json) |
| Secrets | PASS | [client-secrets](qa/runs/2026-09-30-final-regression-05/evidence/client-secrets.json); audit/Gitleaks and artifact sanitation |
| Monitoring | NOT CONFIGURED | Logs/health/readiness code PASS; Sentry delivery UNVERIFIED |
| Backup | PASS | [backup-verification](qa/runs/2026-09-30-final-regression-05/evidence/backup-verification.json); 17 migrations, 70 objects, 2196863 bytes; best-effort source snapshot |
| Restore | UNVERIFIED | Readonly verifier implemented; isolated/staging restore not run |
| Docker | PASS | [container](qa/runs/2026-09-30-final-regression-04/evidence/container.json), [startup/OCI](qa/runs/2026-09-30-final-regression-04/evidence/docker-runtime.json) |
| Staging | NOT CONFIGURED | [checklist](STAGING_CHECKLIST.md) |
| Production SMTP | NOT CONFIGURED | Local Mailpit is not production delivery |
| Production domain | NOT CONFIGURED | No real HTTPS domain/callback UAT |
| Production UAT | UNVERIFIED | [checklist](PRODUCTION_UAT.md); not deployed |

[QA_REPORT](QA_REPORT.md): 45+40 requirements/evidence, исправления и сохранённые failures. Critical 0 / High application bugs 0 в границах проверок; обязательный Full QA gate остаётся открыт. UNVERIFIED и NOT CONFIGURED не считаются PASS.

NOT READY → CODE READY FOR STAGING после закрытия code/Full QA gate → READY FOR PRODUCTION DEPLOYMENT после реального staging UAT → PRODUCTION VERIFIED после production deployment/UAT.
