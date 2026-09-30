# QA Report — Premium LMS hardening

**Статус: NOT READY.** Дата: 30 сентября 2026. Проверяемый code SHA: `6d4f6863ccc6ccb9a655f9f48ab389cad333390b`. Финальный documentation/evidence commit указан в Git/PR. Локальный финальный E2E: 45 PASS, 1 FAIL, 2 UNVERIFIED. После external grant timeout app readiness вернул 503, Auth health недоступен, Docker Engine API 500. GitHub Full QA также FAIL. Это не staging или production verification.

Существующие архитектура и визуальный язык сохранены. [исторический отчёт](qa/history/initial-release-report.md) и все прежние evidence остаются доступны, но не являются проверкой текущего hardening. Новые результаты хранятся по run ID; ошибочные и частично успешные прогоны не удаляются.

## Фактически выполненные проверки

Windows, Node 22.19.0/npm 11.9.0, Next.js 16.3.7/React 19.3.0, Supabase CLI 2.118.0/PostgreSQL 17. Local-only destructive QA: API 56321, DB 56322, Mailpit 56324. Browser: Playwright Chromium; public video — настоящий Chrome 154 с Widevine, без пользовательского профиля. Linux Docker smoke указан отдельно. Другие проекты и volumes не изменялись.

| Команда / сценарий | Результат | Evidence |
|---|---|---|
| npm ci, typecheck, lint, npm test | PASS — 73 unit tests | [final-checks](qa/runs/2026-09-30-final-regression-02/evidence/final-checks.json) |
| test:coverage | PASS — scoped critical modules, не вся LMS | [final-checks](qa/runs/2026-09-30-final-regression-02/evidence/final-checks.json) |
| npm run build, 17 migrations на пустой БД | PASS — standalone и Zod runtime dependency | [final-checks](qa/runs/2026-09-30-final-regression-02/evidence/final-checks.json) |
| test:operations на пустой БД | PASS — 11 bootstrap/MFA recovery/operator scenarios | [operations](qa/runs/2026-09-30-final-operations-02/evidence/operations.json) |
| Seed дважды | PASS — те же stable identities, passwords только .local | [final-checks](qa/runs/2026-09-30-final-regression-02/evidence/final-checks.json) |
| test:db, test:security, test:performance | PASS — реальные PostgreSQL/Auth/RPC, transactional rollback | [security-api](qa/runs/2026-09-30-final-regression-02/evidence/security-api.json); [performance-pagination](qa/runs/2026-09-30-final-regression-02/evidence/performance-pagination.json) |
| npm run e2e на production | 45 PASS, 1 FAIL, 2 UNVERIFIED protected external | [playwright-summary](qa/runs/2026-09-30-final-regression-02/evidence/playwright-summary.json) |
| security:client, audit, Gitleaks | PASS в указанном scope; local backup после последнего reset не запущен из-за Engine outage | [backup source snapshot, 14 migrations](qa/runs/2026-09-30-backup-01/evidence/backup-verification.json); [client-secrets](qa/runs/2026-09-30-final-regression-02/evidence/client-secrets.json); [final-checks](qa/runs/2026-09-30-final-regression-02/evidence/final-checks.json) |
| Docker build/runtime | UNVERIFIED — current CI image/startup PASS, local actual-DB smoke заблокирован Engine API 500 | [availability](qa/runs/2026-09-30-final-regression-02/evidence/runtime-availability.json) |

## Матрица 45 пунктов исходного QA-ТЗ

| № | Область | Status | Evidence / scope |
|---|---|---|---|
| 1 | BUILD / STATIC CHECKS | PASS | [final-checks](qa/runs/2026-09-30-final-regression-02/evidence/final-checks.json) |
| 2 | CLEAN INSTALL | PASS | Чистый npm ci; закреплённый lockfile; [final-checks](qa/runs/2026-09-30-final-regression-02/evidence/final-checks.json) |
| 3 | DATABASE QA | PASS | 17 migrations на пустой БД, 5 DB groups, repeat seed; [final-checks](qa/runs/2026-09-30-final-regression-02/evidence/final-checks.json) |
| 4 | RLS / SECURITY | PASS | [security-api](qa/runs/2026-09-30-final-regression-02/evidence/security-api.json); [playback-access](qa/runs/2026-09-30-final-regression-02/evidence/playback-access.json); [RLS_MATRIX](RLS_MATRIX.md) |
| 5 | AUTH QA | PASS | [auth](qa/runs/2026-09-30-final-regression-02/evidence/auth.json); Mailpit, confirmation/recovery, MFA, logout |
| 6 | ROLE ROUTING | PASS | [mfa-promotion](qa/runs/2026-09-30-final-regression-02/evidence/mfa-promotion.json); [revoked-session](qa/runs/2026-09-30-final-regression-02/evidence/revoked-session.json) |
| 7 | STUDENT FLOW | PASS | [uat](qa/runs/2026-09-30-final-regression-02/evidence/uat.json); [discovery](qa/runs/2026-09-30-final-regression-02/evidence/discovery.json) |
| 8 | COURSE ACCESS | PASS | [playback-access](qa/runs/2026-09-30-final-regression-02/evidence/playback-access.json); [file-expiry](qa/runs/2026-09-30-final-regression-02/evidence/file-expiry.json) |
| 9 | COURSE MANAGEMENT | PASS | [management](qa/runs/2026-09-30-final-regression-02/evidence/management.json); [uat](qa/runs/2026-09-30-final-regression-02/evidence/uat.json) |
| 10 | LESSON EDITOR | PASS | [cms](qa/runs/2026-09-30-final-regression-02/evidence/cms.json); [block-operations](qa/runs/2026-09-30-final-regression-02/evidence/block-operations.json) |
| 11 | VIDEO QA | FAIL | Четыре PUBLIC источника PASS; external grant timeout в финальном local run; [video-providers](qa/runs/2026-09-30-final-regression-02/evidence/video-providers.json). Protected live UNVERIFIED. |
| 12 | FILE UPLOADS | PASS | [media-formats](qa/runs/2026-09-30-final-regression-02/evidence/media-formats.json); [image-variants](qa/runs/2026-09-30-final-regression-02/evidence/image-variants.json); [uploader-hydration](qa/runs/2026-09-30-final-regression-02/evidence/uploader-hydration.json) |
| 13 | DRAFT / PUBLISH | PASS | [uat](qa/runs/2026-09-30-final-regression-02/evidence/uat.json); [playback-access](qa/runs/2026-09-30-final-regression-02/evidence/playback-access.json) |
| 14 | ADMIN USERS | PASS | [management](qa/runs/2026-09-30-final-regression-02/evidence/management.json); [mfa-promotion](qa/runs/2026-09-30-final-regression-02/evidence/mfa-promotion.json); [role-guard](qa/runs/2026-09-30-final-regression-02/evidence/role-guard.json) |
| 15 | EDITOR ROLE | PASS | [uat](qa/runs/2026-09-30-final-regression-02/evidence/uat.json); direct RPC denial в [security-api](qa/runs/2026-09-30-final-regression-02/evidence/security-api.json) |
| 16 | SEARCH | PASS | [discovery](qa/runs/2026-09-30-final-regression-02/evidence/discovery.json); search limits и access-before-results |
| 17 | FILTERS / SORTING | PASS | [discovery](qa/runs/2026-09-30-final-regression-02/evidence/discovery.json); [management](qa/runs/2026-09-30-final-regression-02/evidence/management.json) |
| 18 | PROFILE | PASS | [settings-profile](qa/runs/2026-09-30-final-regression-02/evidence/settings-profile.json) |
| 19 | EMPTY STATES | PASS | Empty DB operator run; [responsive-analytics](qa/runs/2026-09-30-final-regression-02/evidence/responsive-analytics.json); [discovery](qa/runs/2026-09-30-final-regression-02/evidence/discovery.json) |
| 20 | ERROR STATES | PASS | [seo-errors](qa/runs/2026-09-30-final-regression-02/evidence/seo-errors.json); [cms](qa/runs/2026-09-30-final-regression-02/evidence/cms.json); [readiness](qa/runs/2026-09-30-final-regression-02/evidence/readiness.json) |
| 21 | RESPONSIVE QA | PASS | 21 экран × 7 light viewports; [responsive-student-home](qa/runs/2026-09-30-final-regression-02/evidence/responsive-student-home.json); все responsive-*.json |
| 22 | MOBILE LESSON UX | PASS | [playwright-summary](qa/runs/2026-09-30-final-regression-02/evidence/playwright-summary.json); [responsive-lesson](qa/runs/2026-09-30-final-regression-02/evidence/responsive-lesson.json) |
| 23 | TOUCH QA | PASS | Проверки touch targets в touch-*.json; [touch-lesson](qa/runs/2026-09-30-final-regression-02/evidence/touch-lesson.json) |
| 24 | VISUAL QA | PASS | 105 screenshots: desktop/mobile/light/dark, 21 экран; [снимки](qa/runs/2026-09-30-final-regression-02/screenshots/) |
| 25 | LONG CONTENT QA | PASS | [large-course](qa/runs/2026-09-30-final-regression-02/evidence/large-course.json); 300 уроков и sidebar/navigation regression |
| 26 | CONTENT EDGE CASES | PASS | [cms](qa/runs/2026-09-30-final-regression-02/evidence/cms.json); [media-formats](qa/runs/2026-09-30-final-regression-02/evidence/media-formats.json); [block-operations](qa/runs/2026-09-30-final-regression-02/evidence/block-operations.json) |
| 27 | ACCESSIBILITY | PASS | Axe AA/keyboard/focus; [a11y-student-home](qa/runs/2026-09-30-final-regression-02/evidence/a11y-student-home.json); [playwright-summary](qa/runs/2026-09-30-final-regression-02/evidence/playwright-summary.json) |
| 28 | PERFORMANCE | PASS | [performance-pagination](qa/runs/2026-09-30-final-regression-02/evidence/performance-pagination.json); [large-course](qa/runs/2026-09-30-final-regression-02/evidence/large-course.json). Это не нагрузочный SLA. |
| 29 | NETWORK REQUESTS | FAIL | Visual request checks PASS; позже ready 503/Auth connection failed при Docker Engine API 500; [runtime-availability](qa/runs/2026-09-30-final-regression-02/evidence/runtime-availability.json) |
| 30 | CONSOLE | PASS | Browser pageerror/console checks в responsive-*.json; server abort-log limitation ниже |
| 31 | REFRESH QA | PASS | [cms](qa/runs/2026-09-30-final-regression-02/evidence/cms.json); [uat](qa/runs/2026-09-30-final-regression-02/evidence/uat.json); [settings-profile](qa/runs/2026-09-30-final-regression-02/evidence/settings-profile.json) |
| 32 | BROWSER HISTORY | PASS | [auth](qa/runs/2026-09-30-final-regression-02/evidence/auth.json); [large-course](qa/runs/2026-09-30-final-regression-02/evidence/large-course.json); dirty editor guard |
| 33 | DUPLICATE ACTIONS | PASS | [repeat-upload](qa/runs/2026-09-30-final-regression-02/evidence/repeat-upload.json); [uat](qa/runs/2026-09-30-final-regression-02/evidence/uat.json); DB unique constraints |
| 34 | CONCURRENT EDITING | PASS | [cms](qa/runs/2026-09-30-final-regression-02/evidence/cms.json); optimistic conflict, две реальные вкладки |
| 35 | DESTRUCTIVE ACTIONS | PASS | [management](qa/runs/2026-09-30-final-regression-02/evidence/management.json); [role-guard](qa/runs/2026-09-30-final-regression-02/evidence/role-guard.json); published media guards |
| 36 | SLUGS | PASS | [security-api](qa/runs/2026-09-30-final-regression-02/evidence/security-api.json); [uat](qa/runs/2026-09-30-final-regression-02/evidence/uat.json) |
| 37 | SETTINGS | PASS | [settings-profile](qa/runs/2026-09-30-final-regression-02/evidence/settings-profile.json); [admin-surfaces](qa/runs/2026-09-30-final-regression-02/evidence/admin-surfaces.json) |
| 38 | THEME | PASS | Light default, dark persisted; 105 screenshots и dark Axe checks |
| 39 | SEO / INDEXING | PASS | [seo-errors](qa/runs/2026-09-30-final-regression-02/evidence/seo-errors.json); CSP/noindex/robots |
| 40 | TESTS | FAIL | 45 local E2E PASS, 1 FAIL, 2 protected live UNVERIFIED; units/DB/security PASS; GitHub Full QA FAIL отдельно |
| 41 | DEMO / SEED QA | PASS | 5 accounts, 3 courses, 6 modules, 12 lessons, 11 block types, 15 initial private assets; repeat seed |
| 42 | SECRETS | PASS | [client-secrets](qa/runs/2026-09-30-final-regression-02/evidence/client-secrets.json); redacted full-history Gitleaks и npm audit; [final-checks](qa/runs/2026-09-30-final-regression-02/evidence/final-checks.json) |
| 43 | PRODUCTION CONFIG | UNVERIFIED | Runtime schema и Docker локально PASS; production infra/UAT NOT CONFIGURED |
| 44 | FINAL USER ACCEPTANCE TEST | PASS | [uat](qa/runs/2026-09-30-final-regression-02/evidence/uat.json); Admin → publish/assign → A playback/download/complete/relogin → B denied → Editor draft hidden |
| 45 | FINAL REPORT | PASS | Этот отчёт, 45+40 mapping, dated evidence, [RELEASE_READINESS](RELEASE_READINESS.md) |

## Матрица 40 требований hardening

| № | Требование | Status | Evidence / scope |
|---|---|---|---|
| 1 | Protected video | UNVERIFIED | Cloudflare/Mux real API + RS256 code, crypto contracts и access RPC PASS; external credentials NOT CONFIGURED |
| 2 | Watermark | PASS | [settings-profile](qa/runs/2026-09-30-final-regression-02/evidence/settings-profile.json); masked email/ID, interval/opacity, LMS fullscreen |
| 3 | CI | FAIL | PR CI/Full QA реальные runs; runner acquisition failure и YouTube authorization restriction указаны ниже |
| 4 | Dependencies | PASS | Pinned npm lock/actions/base image; Dependabot weekly; npm audit 0 |
| 5 | Branch protection | PASS | Фактическая GitHub API verification: [evidence](qa/runs/2026-09-30-github-protection-01/evidence/github-protection.json) |
| 6 | Release workflow | UNVERIFIED | v* checks → OCI image/artifact → GitHub Release реализованы; release tag не запускался |
| 7 | Env validation | PASS | Strict local/staging/production schema + startup fail-fast; units/runtime tests |
| 8 | Auth/IP limiting | PASS | Explicit trusted proxy ACK, spoof-header/atomic rate tests; [security-api](qa/runs/2026-09-30-final-regression-02/evidence/security-api.json) |
| 9 | Observability | PASS | [readiness](qa/runs/2026-09-30-final-regression-02/evidence/readiness.json); sanitized logs/request UUID; 503 deadline probes |
| 10 | Error tracking | UNVERIFIED | Sentry abstraction/beforeSend tests PASS; backend NOT CONFIGURED |
| 11 | Security headers | PASS | [readiness](qa/runs/2026-09-30-final-regression-02/evidence/readiness.json); exact CSP nonce/origins, HSTS production, nosniff/referrer/permissions |
| 12 | CSRF/mutations | PASS | [MUTATION_AUDIT](MUTATION_AUDIT.md); HTTP/action/RPC negative tests |
| 13 | File access | PASS | [file-expiry](qa/runs/2026-09-30-final-regression-02/evidence/file-expiry.json); [security-api](qa/runs/2026-09-30-final-regression-02/evidence/security-api.json) |
| 14 | Download namespace | PASS | HMAC version/audience/purpose, expiry/tamper units и real TTL [file-expiry](qa/runs/2026-09-30-final-regression-02/evidence/file-expiry.json) |
| 15 | Upload security | PASS | ZIP stream/CRC/expansion/macros/PDF/image tests; [media-formats](qa/runs/2026-09-30-final-regression-02/evidence/media-formats.json). External scanner NOT CONFIGURED. |
| 16 | MFA | PASS | [mfa-promotion](qa/runs/2026-09-30-final-regression-02/evidence/mfa-promotion.json); [role-guard](qa/runs/2026-09-30-final-regression-02/evidence/role-guard.json); 11 bootstrap/recovery checks |
| 17 | Staff deadlines | PASS | [staff-session-ui](qa/runs/2026-09-30-final-regression-02/evidence/staff-session-ui.json); [admin-surfaces](qa/runs/2026-09-30-final-regression-02/evidence/admin-surfaces.json) |
| 18 | Revocation | PASS | [disabled-user](qa/runs/2026-09-30-final-regression-02/evidence/disabled-user.json); [revoked-session](qa/runs/2026-09-30-final-regression-02/evidence/revoked-session.json) |
| 19 | Audit | PASS | [admin-surfaces](qa/runs/2026-09-30-final-regression-02/evidence/admin-surfaces.json); actual RPC event/immutability/filter tests |
| 20 | Versioning | PASS | [uat](qa/runs/2026-09-30-final-regression-02/evidence/uat.json); [playback-access](qa/runs/2026-09-30-final-regression-02/evidence/playback-access.json); published media guarded |
| 21 | Backup/restore | UNVERIFIED | [backup source snapshot, 14 migrations](qa/runs/2026-09-30-backup-01/evidence/backup-verification.json) source/hash/archive PASS; isolated/staging restore UNVERIFIED |
| 22 | Deployment profiles | PASS | [OPERATIONS](OPERATIONS.md): Vercel/Supabase и Docker/proxy; document delivery only |
| 23 | Staging | NOT CONFIGURED | [STAGING_CHECKLIST](STAGING_CHECKLIST.md); реальная staging infra отсутствует |
| 24 | Production UAT | UNVERIFIED | [PRODUCTION_UAT](PRODUCTION_UAT.md); deployment не выполнялся |
| 25 | Performance | PASS | [performance-pagination](qa/runs/2026-09-30-final-regression-02/evidence/performance-pagination.json); real nested staff-call counts, no guessed indexes |
| 26 | Responsive images | PASS | [image-variants](qa/runs/2026-09-30-final-regression-02/evidence/image-variants.json); 480/960/1800 prepared at finalize, arbitrary transforms denied |
| 27 | CSS refactor | PASS | [CSS_ORGANIZATION](CSS_ORGANIZATION.md), preserved cascade hash, 105 screenshots |
| 28 | Design/UX | PASS | Сохранён стиль; 21 экран и обе темы, keyboard/touch/overflow checks |
| 29 | Coverage | PASS | 73 tests; scoped 15 critical modules: 93.48% lines, 91.63% statements, 89.81% branches, 92.68% functions |
| 30 | Protected external test | UNVERIFIED | Два явных SKIP_EXTERNAL_CONFIGURATION; live grant/play/revoke/expiry не заявляется |
| 31 | Security scans | PASS | [client-secrets](qa/runs/2026-09-30-final-regression-02/evidence/client-secrets.json); npm audit, Gitleaks full history; limits ниже |
| 32 | GitHub security | PASS | Dependabot alerts/fixes, secret scanning и push protection verified via API |
| 33 | Release levels | PASS | NOT READY сейчас; далее CODE READY FOR STAGING → READY FOR PRODUCTION DEPLOYMENT → PRODUCTION VERIFIED по отдельным gates |
| 34 | No fake PASS | PASS | FAIL/UNVERIFIED/NOT CONFIGURED сохранены, mock/provider contract scope явен |
| 35 | Final QA | FAIL | Local external grant timeout/Docker unavailability и Full QA YouTube restriction; PR core rerun PASS |
| 36 | Regression | FAIL | [playwright-summary](qa/runs/2026-09-30-final-regression-02/evidence/playwright-summary.json); auth/CMS/UAT/files/progress/search/library/branding/audit PASS, финальный video scenario FAIL |
| 37 | Attack flows | PASS | [security-api](qa/runs/2026-09-30-final-regression-02/evidence/security-api.json); [playback-access](qa/runs/2026-09-30-final-regression-02/evidence/playback-access.json); [revoked-session](qa/runs/2026-09-30-final-regression-02/evidence/revoked-session.json) |
| 38 | Final documents | PASS | QA_REPORT, RELEASE_READINESS, deployment/staging/UAT/backup/security docs |
| 39 | Result | FAIL | Общий release gate не закрыт; подтверждённых открытых Critical/High дефектов кода не выявлено в границах локального аудита |
| 40 | Git | PASS | Отдельные RED/GREEN commits; branch/PR, no force push; прежние evidence сохранены |

## CI

CI выполняет npm ci/types/lint/unit/scoped coverage/audit/Gitleaks/build и отдельный real Supabase/database/security/core browser job. Full QA добавляет все visual/public/protected provider scenarios и Docker. Release v* дополнительно проверяет ancestry main и артефакт образа; настоящий release не запускался.

Фактические runs и jobs находятся в [github-ci](qa/runs/2026-09-30-final-regression-02/evidence/github-ci.json). [Full QA 36711496294](https://github.com/nikitasolonukha/premium-lms/actions/runs/36711496294) на предыдущем code SHA завершился FAIL: YouTube PROVIDER_AUTH_REQUIRED, остальные четыре public provider PASS; [очищенный результат](qa/runs/2026-09-30-github-full-qa-04/evidence/video-providers.json). [Full QA 36713744998](https://github.com/nikitasolonukha/premium-lms/actions/runs/36713744998) на текущем code SHA завершился FAIL только на public YouTube PROVIDER_AUTH_REQUIRED; остальные 45 executable browser scenarios и четыре public providers PASS; protected live tests UNVERIFIED. Docker и Code checks PASS. [Результат](qa/runs/2026-09-30-github-full-qa-05/evidence/run.json). Неуспешный PR Code checks job не выполнял шаги: GitHub runner не смог принять его за пять попыток; [annotation evidence](qa/runs/2026-09-30-github-runner-01/evidence/runner-acquisition.json). PR core CI 36713747664 после rerun непринятого job завершился SUCCESS: Code checks и Database security and E2E PASS. Первоначальный scheduling FAIL сохранён.

CI artifacts содержат только безопасный HTML/JSON summary, fixed error fields и reviewed screenshots. Trace/raw Playwright report/auth failure screenshots/QR/OTP/headers/cookies/provider response bodies не публикуются.

## Protected Video

Cloudflare Stream и Mux реализованы через API inspection + server RS256 signing, TTL 180 seconds. До подписи проверяются live session/email/role, published revision/access/sequence и rate; после provider I/O проверка повторяется. Player обновляет grant до expiry, при отказе удаляет источник. Незавершённая конфигурация скрыта в CMS. Public источники явно обозначаются как PUBLIC VIDEO.

Crypto/provider unit contracts и mocked transport player bridge PASS; [контрактный browser test](qa/runs/2026-09-30-protected-player-01/evidence/verification.json) не является live provider playback и имеет явно ограниченный scope. Credentials/QA assets NOT CONFIGURED; два live tests UNVERIFIED, SKIP_EXTERNAL_CONFIGURATION. Срок уже выданного внешнего bearer token нельзя отозвать приложением раньше TTL. Watermark — masked email/short ID/combined, движется вне controls, interval/opacity настраиваются; native внешнего iframe fullscreen отключён, LMS fullscreen сохраняет overlay. Это не DRM и не защита скачанного файла. [PROTECTED_VIDEO](PROTECTED_VIDEO.md).

## Observability

Строгий startup env schema, UUID request correlation, sanitized fixed structured errors, DB/config health/ready с timeout и 503 доступны. Sentry beforeSend не пропускает request/body/user/headers/crumbs/stack/query; integration/backend delivery UNVERIFIED, DSN NOT CONFIGURED. Обязателен реальный smoke в staging до повышения release status.

При закрытии браузерного context/прерванной навигации Next.js иногда пишет destination stream closed early (digest 1339106479). Browser console/hydration и HTTP checks пройдены; это не считается доказательством отсутствия всех server errors. Low наблюдение остаётся для staging log review; raw logs не публикуются.

## Deployment readiness / Staging readiness

[OPERATIONS](OPERATIONS.md) содержит Vercel+Supabase и Docker+reverse proxy профили: HTTPS/callbacks/SMTP/explicit trusted-IP overwrite/env/storage/video/CSP/monitoring/backup. Read-only backup verifier проверяет полный inventory/bytes/SHA/versions/migrations/custom dump TOC. Локальный проверенный snapshot содержит 14 migrations, best-effort, не quiesced production backup. На текущем code SHA CI выполнил test:backup после 17 migrations и repeat seed (step PASS); latest local source snapshot после последнего reset не выполнен из-за Docker outage. Restore на отдельной среде UNVERIFIED.

Staging, production SMTP/domain/monitoring backend NOT CONFIGURED; staging и production UAT UNVERIFIED. [STAGING_CHECKLIST](STAGING_CHECKLIST.md), [PRODUCTION_UAT](PRODUCTION_UAT.md), [BACKUP_RESTORE](BACKUP_RESTORE.md). Никакое публичное размещение или production release в этой работе не выполнялось.

## GitHub repository protection

Main фактически требует PR и Code checks + Database security and E2E, strict up-to-date, enforce admins, conversation resolution; force push и deletion запрещены. Required check app_id закреплён на GitHub Actions. Solo approval count 0. Dependabot security fixes/alerts, secret scanning и push protection включены и проверены через API; [GITHUB_PROTECTION](GITHUB_PROTECTION.md). Это отдельное свидетельство от CI success.

## Исправленные дефекты и открытые ограничения

| Дефект / ограничение | Severity / итог | Доказательство |
|---|---|---|
| Runtime Docker не находил Zod, standalone Windows случайно использовал parent dependency | High — исправлен serverExternalPackages, local/CI Docker PASS | Docker runtime evidence; pinned package traced |
| Native opacity step делал default form невалидной | Medium — исправлен step при серверном range validation | settings-profile E2E |
| Disabled Admin demotion/repeated disable ошибочно блокировались last-Admin guard | High — исправлены две forward migrations с active-target check, advisory lock сохранён | role-guard + MFA promotion |
| SSR upload позволял выбор файла до hydration и терял change | Medium — controls disabled до реальной hydration | [RED](qa/runs/2026-09-30-uploader-red-01/evidence/playwright-summary.json), [uploader-hydration](qa/runs/2026-09-30-final-regression-02/evidence/uploader-hydration.json) |
| Catalog/library повторяли shared staff check в каждой строке | Medium — statement InitPlans, row checks сохранены | catalog 346→43, library 1220→8 на 300 fixtures; no guessed indexes |
| YouTube требует авторизацию на GitHub-hosted runner | Release blocker — Full QA FAIL; local real playback PASS | actual video CI result, не обход/не mock |
| GitHub runner acquisition failure | Закрыт rerun core CI; исходный FAIL сохранён | actual GitHub annotation + SUCCESS core CI |
| Docker Engine API 500 / Supabase недоступен | High operational blocker — local ready 503; причина не установлена, global restart не выполнялся | runtime-availability.json |
| Protected live/restore/staging/SMTP/monitoring delivery | UNVERIFIED / NOT CONFIGURED | отдельные checklist gates |

Открытых подтверждённых Critical: 0; High дефектов приложения: 0 в границах выполненных проверок. Общий release gate **не закрыт** из-за фактического Full QA FAIL и локальной недоступности Docker/Supabase. Корреляция outage с grant timeout не доказывает его первичную причину; повторный local QA обязателен после восстановления. Сканеры покрывают известные секреты/правила/advisories, а не доказывают отсутствие всех уязвимостей. Benchmarks локальны, EXPLAIN на RPC boundary не раскрывает все PL/pgSQL nested plans; profile измеряет реальные nested staff calls. Browser emulation не заменяет реальные мобильные устройства.

Далее: восстановить общий Docker по согласованному операторскому окну, повторить local video/full QA/backup/actual-DB container smoke; закрыть YouTube Full QA gate на разрешённой среде; затем CODE READY FOR STAGING. После настоящего staging UAT — READY FOR PRODUCTION DEPLOYMENT; после production infrastructure/UAT — PRODUCTION VERIFIED. Текущий статус остаётся NOT READY.
