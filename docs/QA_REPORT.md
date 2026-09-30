# QA Report — Premium LMS hardening

**Статус: NOT READY.** Дата: 30 сентября 2026. Проверенный baseline code SHA: `45cf002bfa4998de02402038138d6e5037fbf609`; финальный documentation/evidence commit указан в Git/PR. Последний полный локальный E2E baseline: **47 PASS, 0 FAIL, 2 UNVERIFIED**. Core GitHub CI baseline PASS; настоящий Full QA baseline FAIL на YouTube authorization requirement GitHub-hosted runner. Staging/production verification отсутствует. Более позднее дополнение для собственных видео заказчика проверяется отдельно ниже, а не выдаётся за повтор всего baseline QA.

Архитектура и визуальный язык сохранены. [Первоначальный исторический отчёт](qa/history/initial-release-report.md) и все старые evidence сохранены. Новые прогоны записаны отдельно; неуспешные попытки остаются FAIL.

## Дополнение: надпись на видео заказчика

После уточнения задачи добавлено название академии из Admin Settings рядом с минимизированной меткой ученика. Окончательное название и разрешение скачивания заказчиком пока не выбраны. Для direct video метка привязана к области кадров по metadata и ResizeObserver: в мобильном fullscreen не остаётся в чёрной полосе. Для внешних iframe, где размеры исходных кадров недоступны, используется рамка 16:9; это не доказательство защиты произвольного portrait/embed источника.

Отдельные результаты: [feature checks](qa/runs/2026-09-30-owner-watermark-frame-green-01/evidence/feature-checks.json), [browser QA](qa/runs/2026-09-30-owner-watermark-frame-green-01/evidence/playwright-summary.json), [overlay scope](qa/runs/2026-09-30-owner-watermark-frame-green-01/evidence/owner-watermark.json). Прогоны с ошибками до коррекции сохранены отдельно и не являются PASS. Проверяется DOM overlay на тестовом PUBLIC CC0 MP4 и тестовых изображениях, не live protected playback и не материалы заказчика. Автоматический video burn-in не реализован; метка не попадает в скачанный исходный файл. Подробно: [CUSTOMER_VIDEO](CUSTOMER_VIDEO.md).

## Дополнение: выравнивание страницы входа

По скриншоту пользователя исправлено пересечение подписи «Откройте новую перспективу» с нижним маркером `01 — ∞`. Подпись вынесена из абсолютного декоративного блока в обычный поток, две строки текста отделены от SVG-стрелки, нижняя строка получила собственный отступ. Это также сохраняет подпись внутри панели на планшете.

На новой локальной production-сборке: typecheck, lint и build PASS; [26 проверок layout](qa/runs/2026-09-30-auth-caption-01/evidence/layout.json) PASS, без горизонтального overflow и browser console/page errors. `/login` проверен на всех семи заданных размерах в обеих темах; общий блок `/register`, `/forgot-password`, `/reset-password` — на 768×1024 и 1440×900 в обеих темах. [14 полноэкранных снимков и деталь исправления](qa/runs/2026-09-30-auth-caption-01/screenshots/). Вручную просмотрены login light 375×812, 768×1024, 1440×900 и dark 1440×900. Это ограниченная проверка оформления, не повтор полного Auth/security QA. При закрытии браузерных страниц снова наблюдалось ранее описанное Low-сообщение сервера `destination stream closed early`; оно не выдаётся за отсутствие server errors.

## Фактически выполненные проверки

Windows, Node 22.19.0/npm 11.9.0, Next.js 16.3.7/React 19.3.0, Supabase CLI 2.118.0/PostgreSQL 17. Разрушительные fixtures ограничены локальными API 56321/DB 56322/Mailpit 56324. Browser: Chromium, для реальных PUBLIC видео — Chrome 154 с Widevine без пользовательского профиля. Shared Docker/WSL не перезапускался агентом; действия с контейнерами ограничены LMS.

| Команда / сценарий | Результат | Evidence |
|---|---|---|
| npm ci, typecheck, lint, npm test | PASS — 78 tests | [static-checks](qa/runs/2026-09-30-final-regression-04/evidence/static-checks.json) |
| test:coverage | PASS — 16 выбранных критических модулей | [static-checks](qa/runs/2026-09-30-final-regression-04/evidence/static-checks.json) |
| production build | PASS — standalone/runtime dependencies | [static-checks](qa/runs/2026-09-30-final-regression-04/evidence/static-checks.json) |
| Empty DB, 17 migrations | PASS — повторный reset с проверкой реальной migration history | [runtime-availability](qa/runs/2026-09-30-final-regression-05/evidence/runtime-availability.json) |
| test:operations до seed | PASS — 11 bootstrap/MFA recovery/cleanup сценариев | [operations](qa/runs/2026-09-30-final-regression-04/evidence/operations.json) |
| Seed дважды | PASS — 5 identities, 3 курса, 6 модулей, 12 уроков, 11 blocks, 15 initial assets | [database-checks](qa/runs/2026-09-30-final-regression-05/evidence/database-checks.json) |
| test:db, test:security, test:performance | PASS — 5 DB groups, 32 API security scenarios и дополнительные suites; 300 rollback fixtures/list | [database-checks](qa/runs/2026-09-30-final-regression-05/evidence/database-checks.json); [security-api](qa/runs/2026-09-30-final-regression-05/evidence/security-api.json); [performance-pagination](qa/runs/2026-09-30-final-regression-05/evidence/performance-pagination.json) |
| npm run e2e / production | 47 PASS / 0 FAIL / 2 UNVERIFIED | [playwright-summary](qa/runs/2026-09-30-final-regression-05/evidence/playwright-summary.json) |
| Docker build, startup и actual-DB smoke | PASS — uid 1001, OCI revision, реальные health/public page, cleanup | [container](qa/runs/2026-09-30-final-regression-04/evidence/container.json), [startup/OCI](qa/runs/2026-09-30-final-regression-04/evidence/docker-runtime.json) |
| test:backup | PASS — archive/TOC/inventory/SHA; restore UNVERIFIED | [backup-verification](qa/runs/2026-09-30-final-regression-05/evidence/backup-verification.json) |
| audit, Gitleaks, client scan | PASS в заявленном scope | [static-checks](qa/runs/2026-09-30-final-regression-04/evidence/static-checks.json); [client-secrets](qa/runs/2026-09-30-final-regression-05/evidence/client-secrets.json) |

Static/Docker/пустой bootstrap: final-regression-04. Затем отдельный reset перед demo/security: final-regression-05. Bootstrap создаёт собственного Admin; security fixture требует единственного seed Admin. Ошибочная попытка без промежуточного reset сохранена как FAIL с [объяснением](qa/runs/2026-09-30-final-regression-04/evidence/security-fixture-precondition.json). Первая static harness попытка с npm.ps1 не выполнила install, также сохранена в final-regression-03. Это ошибки QA-координатора, не удалённые evidence.

## Матрица 45 пунктов исходного QA-ТЗ

| № | Область | Status | Evidence / scope |
|---|---|---|---|
| 1 | BUILD / STATIC CHECKS | PASS | [final-checks](qa/runs/2026-09-30-final-regression-05/evidence/final-checks.json) |
| 2 | CLEAN INSTALL | PASS | Чистый npm ci; закреплённый lockfile; [final-checks](qa/runs/2026-09-30-final-regression-05/evidence/final-checks.json) |
| 3 | DATABASE QA | PASS | 17 migrations на пустой БД, 5 DB groups, repeat seed; [final-checks](qa/runs/2026-09-30-final-regression-05/evidence/final-checks.json) |
| 4 | RLS / SECURITY | PASS | [security-api](qa/runs/2026-09-30-final-regression-05/evidence/security-api.json); [playback-access](qa/runs/2026-09-30-final-regression-05/evidence/playback-access.json); [RLS_MATRIX](RLS_MATRIX.md) |
| 5 | AUTH QA | PASS | [auth](qa/runs/2026-09-30-final-regression-05/evidence/auth.json); Mailpit, confirmation/recovery, MFA, logout |
| 6 | ROLE ROUTING | PASS | [mfa-promotion](qa/runs/2026-09-30-final-regression-05/evidence/mfa-promotion.json); [revoked-session](qa/runs/2026-09-30-final-regression-05/evidence/revoked-session.json) |
| 7 | STUDENT FLOW | PASS | [uat](qa/runs/2026-09-30-final-regression-05/evidence/uat.json); [discovery](qa/runs/2026-09-30-final-regression-05/evidence/discovery.json) |
| 8 | COURSE ACCESS | PASS | [playback-access](qa/runs/2026-09-30-final-regression-05/evidence/playback-access.json); [file-expiry](qa/runs/2026-09-30-final-regression-05/evidence/file-expiry.json) |
| 9 | COURSE MANAGEMENT | PASS | [management](qa/runs/2026-09-30-final-regression-05/evidence/management.json); [uat](qa/runs/2026-09-30-final-regression-05/evidence/uat.json) |
| 10 | LESSON EDITOR | PASS | [cms](qa/runs/2026-09-30-final-regression-05/evidence/cms.json); [block-operations](qa/runs/2026-09-30-final-regression-05/evidence/block-operations.json) |
| 11 | VIDEO QA | PASS | [video-providers](qa/runs/2026-09-30-final-regression-05/evidence/video-providers.json): пять PUBLIC адаптеров в локальном Chrome; live protected video UNVERIFIED отдельно. |
| 12 | FILE UPLOADS | PASS | [media-formats](qa/runs/2026-09-30-final-regression-05/evidence/media-formats.json); [image-variants](qa/runs/2026-09-30-final-regression-05/evidence/image-variants.json); [uploader-hydration](qa/runs/2026-09-30-final-regression-05/evidence/uploader-hydration.json) |
| 13 | DRAFT / PUBLISH | PASS | [uat](qa/runs/2026-09-30-final-regression-05/evidence/uat.json); [playback-access](qa/runs/2026-09-30-final-regression-05/evidence/playback-access.json) |
| 14 | ADMIN USERS | PASS | [management](qa/runs/2026-09-30-final-regression-05/evidence/management.json); [mfa-promotion](qa/runs/2026-09-30-final-regression-05/evidence/mfa-promotion.json); [role-guard](qa/runs/2026-09-30-final-regression-05/evidence/role-guard.json) |
| 15 | EDITOR ROLE | PASS | [uat](qa/runs/2026-09-30-final-regression-05/evidence/uat.json); direct RPC denial в [security-api](qa/runs/2026-09-30-final-regression-05/evidence/security-api.json) |
| 16 | SEARCH | PASS | [discovery](qa/runs/2026-09-30-final-regression-05/evidence/discovery.json); search limits и access-before-results |
| 17 | FILTERS / SORTING | PASS | [discovery](qa/runs/2026-09-30-final-regression-05/evidence/discovery.json); [management](qa/runs/2026-09-30-final-regression-05/evidence/management.json) |
| 18 | PROFILE | PASS | [settings-profile](qa/runs/2026-09-30-final-regression-05/evidence/settings-profile.json) |
| 19 | EMPTY STATES | PASS | Empty DB operator run; [responsive-analytics](qa/runs/2026-09-30-final-regression-05/evidence/responsive-analytics.json); [discovery](qa/runs/2026-09-30-final-regression-05/evidence/discovery.json) |
| 20 | ERROR STATES | PASS | [seo-errors](qa/runs/2026-09-30-final-regression-05/evidence/seo-errors.json); [cms](qa/runs/2026-09-30-final-regression-05/evidence/cms.json); [readiness](qa/runs/2026-09-30-final-regression-05/evidence/readiness.json) |
| 21 | RESPONSIVE QA | PASS | 21 экран × 7 light viewports; [responsive-student-home](qa/runs/2026-09-30-final-regression-05/evidence/responsive-student-home.json); все responsive-*.json |
| 22 | MOBILE LESSON UX | PASS | [playwright-summary](qa/runs/2026-09-30-final-regression-05/evidence/playwright-summary.json); [responsive-lesson](qa/runs/2026-09-30-final-regression-05/evidence/responsive-lesson.json) |
| 23 | TOUCH QA | PASS | Проверки touch targets в touch-*.json; [touch-lesson](qa/runs/2026-09-30-final-regression-05/evidence/touch-lesson.json) |
| 24 | VISUAL QA | PASS | 105 screenshots: desktop/mobile/light/dark, 21 экран; [снимки](qa/runs/2026-09-30-final-regression-05/screenshots/) |
| 25 | LONG CONTENT QA | PASS | [large-course](qa/runs/2026-09-30-final-regression-05/evidence/large-course.json); 300 уроков и sidebar/navigation regression |
| 26 | CONTENT EDGE CASES | PASS | [cms](qa/runs/2026-09-30-final-regression-05/evidence/cms.json); [media-formats](qa/runs/2026-09-30-final-regression-05/evidence/media-formats.json); [block-operations](qa/runs/2026-09-30-final-regression-05/evidence/block-operations.json) |
| 27 | ACCESSIBILITY | PASS | Axe AA/keyboard/focus; [a11y-student-home](qa/runs/2026-09-30-final-regression-05/evidence/a11y-student-home.json); [playwright-summary](qa/runs/2026-09-30-final-regression-05/evidence/playwright-summary.json) |
| 28 | PERFORMANCE | PASS | [performance-pagination](qa/runs/2026-09-30-final-regression-05/evidence/performance-pagination.json); [large-course](qa/runs/2026-09-30-final-regression-05/evidence/large-course.json). Это не нагрузочный SLA. |
| 29 | NETWORK REQUESTS | PASS | [runtime-availability](qa/runs/2026-09-30-final-regression-05/evidence/runtime-availability.json); actual app/Auth/Mailpit HTTP 200, PostgreSQL TCP и 17 migrations; visual network checks. |
| 30 | CONSOLE | PASS | Browser pageerror/console checks в responsive-*.json; server abort-log limitation ниже |
| 31 | REFRESH QA | PASS | [cms](qa/runs/2026-09-30-final-regression-05/evidence/cms.json); [uat](qa/runs/2026-09-30-final-regression-05/evidence/uat.json); [settings-profile](qa/runs/2026-09-30-final-regression-05/evidence/settings-profile.json) |
| 32 | BROWSER HISTORY | PASS | [auth](qa/runs/2026-09-30-final-regression-05/evidence/auth.json); [large-course](qa/runs/2026-09-30-final-regression-05/evidence/large-course.json); dirty editor guard |
| 33 | DUPLICATE ACTIONS | PASS | [repeat-upload](qa/runs/2026-09-30-final-regression-05/evidence/repeat-upload.json); [uat](qa/runs/2026-09-30-final-regression-05/evidence/uat.json); DB unique constraints |
| 34 | CONCURRENT EDITING | PASS | [cms](qa/runs/2026-09-30-final-regression-05/evidence/cms.json); optimistic conflict, две реальные вкладки |
| 35 | DESTRUCTIVE ACTIONS | PASS | [management](qa/runs/2026-09-30-final-regression-05/evidence/management.json); [role-guard](qa/runs/2026-09-30-final-regression-05/evidence/role-guard.json); published media guards |
| 36 | SLUGS | PASS | [security-api](qa/runs/2026-09-30-final-regression-05/evidence/security-api.json); [uat](qa/runs/2026-09-30-final-regression-05/evidence/uat.json) |
| 37 | SETTINGS | PASS | [settings-profile](qa/runs/2026-09-30-final-regression-05/evidence/settings-profile.json); [admin-surfaces](qa/runs/2026-09-30-final-regression-05/evidence/admin-surfaces.json) |
| 38 | THEME | PASS | Light default, dark persisted; 105 screenshots и dark Axe checks |
| 39 | SEO / INDEXING | PASS | [seo-errors](qa/runs/2026-09-30-final-regression-05/evidence/seo-errors.json); CSP/noindex/robots |
| 40 | TESTS | FAIL | 47 local PASS, 0 FAIL, 2 protected live UNVERIFIED; [playwright-summary](qa/runs/2026-09-30-final-regression-05/evidence/playwright-summary.json). Обязательный GitHub Full QA FAIL: [actual CI](qa/runs/2026-09-30-github-head-45cf002/evidence/run.json). |
| 41 | DEMO / SEED QA | PASS | 5 accounts, 3 courses, 6 modules, 12 lessons, 11 block types, 15 initial private assets; repeat seed |
| 42 | SECRETS | PASS | [client-secrets](qa/runs/2026-09-30-final-regression-05/evidence/client-secrets.json); redacted full-history Gitleaks и npm audit; [final-checks](qa/runs/2026-09-30-final-regression-05/evidence/final-checks.json) |
| 43 | PRODUCTION CONFIG | UNVERIFIED | Runtime schema и Docker локально PASS; production infra/UAT NOT CONFIGURED |
| 44 | FINAL USER ACCEPTANCE TEST | PASS | [uat](qa/runs/2026-09-30-final-regression-05/evidence/uat.json); Admin → publish/assign → A playback/download/complete/relogin → B denied → Editor draft hidden |
| 45 | FINAL REPORT | PASS | Этот отчёт, 45+40 mapping, dated evidence, [RELEASE_READINESS](RELEASE_READINESS.md) |

## Матрица 40 требований hardening

| № | Требование | Status | Evidence / scope |
|---|---|---|---|
| 1 | Protected video | UNVERIFIED | Cloudflare/Mux real API + RS256 code, crypto contracts и access RPC PASS; external credentials NOT CONFIGURED |
| 2 | Watermark | PASS | [settings-profile](qa/runs/2026-09-30-final-regression-05/evidence/settings-profile.json); masked email/ID, interval/opacity, LMS fullscreen |
| 3 | CI | FAIL | Core CI: Code checks и 13 browser scenarios PASS; Full QA: 46 PASS / 1 YouTube FAIL / 2 UNVERIFIED. [actual CI](qa/runs/2026-09-30-github-head-45cf002/evidence/run.json) |
| 4 | Dependencies | PASS | Pinned npm lock/actions/base image; Dependabot weekly; npm audit 0 |
| 5 | Branch protection | PASS | Фактическая GitHub API verification: [evidence](qa/runs/2026-09-30-github-protection-01/evidence/github-protection.json) |
| 6 | Release workflow | UNVERIFIED | v* checks → OCI image/artifact → GitHub Release реализованы; release tag не запускался |
| 7 | Env validation | PASS | Strict local/staging/production schema + startup fail-fast; units/runtime tests |
| 8 | Auth/IP limiting | PASS | Explicit trusted proxy ACK, spoof-header/atomic rate tests; [security-api](qa/runs/2026-09-30-final-regression-05/evidence/security-api.json) |
| 9 | Observability | PASS | [readiness](qa/runs/2026-09-30-final-regression-05/evidence/readiness.json); sanitized logs/request UUID; 503 deadline probes |
| 10 | Error tracking | UNVERIFIED | Sentry abstraction/beforeSend tests PASS; backend NOT CONFIGURED |
| 11 | Security headers | PASS | [readiness](qa/runs/2026-09-30-final-regression-05/evidence/readiness.json); exact CSP nonce/origins, HSTS production, nosniff/referrer/permissions |
| 12 | CSRF/mutations | PASS | [MUTATION_AUDIT](MUTATION_AUDIT.md); HTTP/action/RPC negative tests |
| 13 | File access | PASS | [file-expiry](qa/runs/2026-09-30-final-regression-05/evidence/file-expiry.json); [security-api](qa/runs/2026-09-30-final-regression-05/evidence/security-api.json) |
| 14 | Download namespace | PASS | HMAC version/audience/purpose, expiry/tamper units и real TTL [file-expiry](qa/runs/2026-09-30-final-regression-05/evidence/file-expiry.json) |
| 15 | Upload security | PASS | ZIP stream/CRC/expansion/macros/PDF/image tests; [media-formats](qa/runs/2026-09-30-final-regression-05/evidence/media-formats.json). External scanner NOT CONFIGURED. |
| 16 | MFA | PASS | [mfa-promotion](qa/runs/2026-09-30-final-regression-05/evidence/mfa-promotion.json); [role-guard](qa/runs/2026-09-30-final-regression-05/evidence/role-guard.json); 11 bootstrap/recovery checks |
| 17 | Staff deadlines | PASS | [staff-session-ui](qa/runs/2026-09-30-final-regression-05/evidence/staff-session-ui.json); [staff-prefetch](qa/runs/2026-09-30-final-regression-05/evidence/staff-prefetch.json); actual session ID, шесть транспортов, readonly prefetch, подмена marker и expired access проверены. |
| 18 | Revocation | PASS | [disabled-user](qa/runs/2026-09-30-final-regression-05/evidence/disabled-user.json); [revoked-session](qa/runs/2026-09-30-final-regression-05/evidence/revoked-session.json) |
| 19 | Audit | PASS | [admin-surfaces](qa/runs/2026-09-30-final-regression-05/evidence/admin-surfaces.json); actual RPC event/immutability/filter tests |
| 20 | Versioning | PASS | [uat](qa/runs/2026-09-30-final-regression-05/evidence/uat.json); [playback-access](qa/runs/2026-09-30-final-regression-05/evidence/playback-access.json); published media guarded |
| 21 | Backup/restore | UNVERIFIED | [backup-verification](qa/runs/2026-09-30-final-regression-05/evidence/backup-verification.json): source snapshot PASS, 17 migrations, 70 objects / 2196863 bytes. Isolated/staging restore UNVERIFIED. |
| 22 | Deployment profiles | PASS | [OPERATIONS](OPERATIONS.md): Vercel/Supabase и Docker/proxy; document delivery only |
| 23 | Staging | NOT CONFIGURED | [STAGING_CHECKLIST](STAGING_CHECKLIST.md); реальная staging infra отсутствует |
| 24 | Production UAT | UNVERIFIED | [PRODUCTION_UAT](PRODUCTION_UAT.md); deployment не выполнялся |
| 25 | Performance | PASS | [performance-pagination](qa/runs/2026-09-30-final-regression-05/evidence/performance-pagination.json); real nested staff-call counts, no guessed indexes |
| 26 | Responsive images | PASS | [image-variants](qa/runs/2026-09-30-final-regression-05/evidence/image-variants.json); 480/960/1800 prepared at finalize, arbitrary transforms denied |
| 27 | CSS refactor | PASS | [CSS_ORGANIZATION](CSS_ORGANIZATION.md), preserved cascade hash, 105 screenshots |
| 28 | Design/UX | PASS | Сохранён стиль; 21 экран и обе темы, keyboard/touch/overflow checks |
| 29 | Coverage | PASS | 78 tests; scoped 16 critical modules: 93.58% lines, 91.73% statements, 90.01% branches, 92.94% functions. Не coverage всей LMS. |
| 30 | Protected external test | UNVERIFIED | Два явных SKIP_EXTERNAL_CONFIGURATION; live grant/play/revoke/expiry не заявляется |
| 31 | Security scans | PASS | [client-secrets](qa/runs/2026-09-30-final-regression-05/evidence/client-secrets.json); npm audit, Gitleaks full history; limits ниже |
| 32 | GitHub security | PASS | Dependabot alerts/fixes, secret scanning и push protection verified via API |
| 33 | Release levels | PASS | NOT READY сейчас; далее CODE READY FOR STAGING → READY FOR PRODUCTION DEPLOYMENT → PRODUCTION VERIFIED по отдельным gates |
| 34 | No fake PASS | PASS | FAIL/UNVERIFIED/NOT CONFIGURED сохранены, mock/provider contract scope явен |
| 35 | Final QA | FAIL | Локальные static/DB/security/Docker gates PASS; E2E 47/0/2; [final-checks](qa/runs/2026-09-30-final-regression-05/evidence/final-checks.json). Full QA gate FAIL: [actual CI](qa/runs/2026-09-30-github-head-45cf002/evidence/run.json). |
| 36 | Regression | PASS | [playwright-summary](qa/runs/2026-09-30-final-regression-05/evidence/playwright-summary.json); локальные Auth/CMS/UAT/files/progress/search/library/branding/audit/public video; внешние protected skips не PASS. |
| 37 | Attack flows | PASS | [security-api](qa/runs/2026-09-30-final-regression-05/evidence/security-api.json); [playback-access](qa/runs/2026-09-30-final-regression-05/evidence/playback-access.json); [revoked-session](qa/runs/2026-09-30-final-regression-05/evidence/revoked-session.json) |
| 38 | Final documents | PASS | QA_REPORT, RELEASE_READINESS, deployment/staging/UAT/backup/security docs |
| 39 | Result | FAIL | Общий release gate не закрыт; подтверждённых открытых Critical/High дефектов кода не выявлено в границах локального аудита |
| 40 | Git | PASS | Отдельные RED/GREEN commits; branch/PR, no force push; прежние evidence сохранены |

## CI

[Core CI 36721783395](https://github.com/nikitasolonukha/premium-lms/actions/runs/36721783395): Code checks и Database security and E2E PASS, 13/13 browser scenarios. [Manual Full QA 36721968632](https://github.com/nikitasolonukha/premium-lms/actions/runs/36721968632) и [PR Full QA 36721784260](https://github.com/nikitasolonukha/premium-lms/actions/runs/36721784260): 46 PASS / 1 FAIL / 2 UNVERIFIED, Code checks/Docker PASS. Единственный browser FAIL — YouTube PROVIDER_AUTH_REQUIRED; Vimeo/Rutube/direct/external PASS. [actual CI](qa/runs/2026-09-30-github-head-45cf002/evidence/run.json). Проверки исполнялись на code SHA выше; следующие docs-only commit/run не выдаются за уже завершённый CI.

Auth history test теперь ждёт завершения logout перед Back. Staff fixture берёт точный session ID текущего браузера; фоновый Next prefetch больше не обновляет idle. Обе прежние CI ошибки закрыты фактическими локальным и GitHub прогонами. Предыдущий fe8edc9 Full QA 43/3/2 сохранён в [evidence](qa/runs/2026-09-30-github-head-fe8edc9/evidence/run.json); более ранние scheduling/Engine/public-video failures тоже остаются в истории.

CI публикует только ограниченные JSON/HTML summaries, фиксированные error fields и approved visual screenshots. Auth/MFA failure screenshots/QR/OTP, raw logs/traces, headers/cookies, signed URLs и ответы provider API не публикуются. Release v* checks/ancestry main/OCI artifact/GitHub Release реализованы; настоящий tag release не запускался.

## Protected Video

Cloudflare Stream и Mux: реальный API inspection + server RS256 signing, TTL 180 секунд. До подписи проверяются live session/email/role, published revision/access/sequence и rate; после внешнего I/O доступ проверяется снова. Player обновляет grant до expiry и удаляет источник при отказе. CMS скрывает незавершённую конфигурацию; public sources обозначаются PUBLIC VIDEO. Crypto/provider contracts и ограниченный [mocked transport browser contract](qa/runs/2026-09-30-protected-player-01/evidence/verification.json) PASS, а live credentials/QA assets NOT CONFIGURED и два live tests UNVERIFIED / SKIP_EXTERNAL_CONFIGURATION.

Уже выданный bearer grant может жить до TTL. Watermark: masked email/short ID/combined, interval/opacity, положение вне controls, LMS fullscreen overlay; native fullscreen внешнего iframe ограничен. Это не DRM и не защита скачанного файла. [PROTECTED_VIDEO](PROTECTED_VIDEO.md).

## Observability

Строгая startup schema, UUID correlation, fixed sanitized structured errors, DB/config health/ready с timeout/503 проверены. Actual local probes сейчас HTTP 200: [runtime-availability](qa/runs/2026-09-30-final-regression-05/evidence/runtime-availability.json). Sentry beforeSend не пропускает request/body/user/headers/crumbs/stack/query; DSN/backend NOT CONFIGURED, доставка UNVERIFIED.

При закрытии browser context или прерванной навигации Next иногда пишет destination stream closed early, digest 1339106479. Это Low наблюдение для staging log review; browser console/hydration/HTTP checks не доказывают отсутствия всех server errors. Raw logs остаются приватными.

## Deployment readiness / Staging readiness

[OPERATIONS](OPERATIONS.md): Vercel+Supabase и Docker+reverse proxy, HTTPS/callbacks/SMTP/trusted-IP overwrite/env/storage/video/CSP/monitoring/backup. Новый source snapshot: **70 объектов, 2196863 байт, 17 migrations**, pg_dump custom/pg_restore TOC/SHA полного Storage inventory PASS. Это best-effort snapshot; isolated/staging restore UNVERIFIED. [BACKUP_RESTORE](BACKUP_RESTORE.md).

Staging, production SMTP/domain, monitoring backend NOT CONFIGURED. Staging и production UAT UNVERIFIED: [STAGING_CHECKLIST](STAGING_CHECKLIST.md), [PRODUCTION_UAT](PRODUCTION_UAT.md). Deployment и production release не выполнялись.

## GitHub repository protection

Main: PR, Code checks + Database security and E2E, strict up-to-date, enforce admins, conversation resolution, no force push/deletion; required checks app_id закреплён. Solo approvals 0. Dependabot alerts/fixes, secret scanning и push protection фактически проверены: [GITHUB_PROTECTION](GITHUB_PROTECTION.md). Это отдельная проверка от CI success.

## Исправленные дефекты и открытые ограничения

| Дефект / ограничение | Severity / итог | Evidence |
|---|---|---|
| Docker runtime не находил Zod | High — исправлен tracing через serverExternalPackages | [container](qa/runs/2026-09-30-final-regression-04/evidence/container.json), [startup/OCI](qa/runs/2026-09-30-final-regression-04/evidence/docker-runtime.json) |
| Disabled Admin demotion/repeat disable неверно требовали LAST_ADMIN | High — исправлены forward migrations; active last Admin защищён | [role-guard](qa/runs/2026-09-30-final-regression-05/evidence/role-guard.json), [mfa-promotion](qa/runs/2026-09-30-final-regression-05/evidence/mfa-promotion.json) |
| Upload терял выбор до hydration | Medium — input/button disabled до реального обработчика | [uploader-hydration](qa/runs/2026-09-30-final-regression-05/evidence/uploader-hydration.json) |
| Default opacity делала native form невалидной | Medium — исправлен step, серверный range сохранён | [settings-profile](qa/runs/2026-09-30-final-regression-05/evidence/settings-profile.json) |
| Shared staff RLS checks повторялись для каждой строки | Medium — InitPlans, row authorization сохранена | [performance-pagination](qa/runs/2026-09-30-final-regression-05/evidence/performance-pagination.json); no guessed indexes |
| Background Next prefetch продлевал staff idle | Medium — original headers/derived proxy marker/readonly RPC; expiry не обходится | [staff-prefetch](qa/runs/2026-09-30-final-regression-05/evidence/staff-prefetch.json); RED checkpoints a3ab97b/d897cba, GREEN 45cf002 |
| Auth history и staff fixture race | Исправлены ожиданием logout и точным SID/завершением navigation | local и GitHub actual PASS |
| Engine API 500 и stale host port forwarding | Исторический High operational blocker; сейчас runtime и Docker smoke PASS, root cause не установлен | [runtime-availability](qa/runs/2026-09-30-final-regression-05/evidence/runtime-availability.json); старый failed evidence сохранён |
| YouTube требует authorization GitHub runner | Открытый release gate: Full QA FAIL; не обходится и не маскируется | [actual CI](qa/runs/2026-09-30-github-head-45cf002/evidence/run.json) |
| Protected live, restore, staging, SMTP, monitoring | UNVERIFIED / NOT CONFIGURED | отдельные checklist gates |

Подтверждённых открытых Critical: 0; High дефектов приложения: 0 в пределах выполненных проверок. Статус **NOT READY** сохраняется из-за реального Full QA FAIL. Для закрытия нужен разрешённый runner/source, где настоящий YouTube playback проверяется без обхода ограничений провайдера. Затем CODE READY FOR STAGING; после настоящего staging UAT — READY FOR PRODUCTION DEPLOYMENT; после production deployment/UAT — PRODUCTION VERIFIED.

Сканеры покрывают известные rules/advisories/secrets, а не доказывают отсутствие всех уязвимостей. Benchmarks локальны; EXPLAIN на RPC boundary не раскрывает весь nested PL/pgSQL plan, но реальные function calls измерены. Browser emulation не заменяет физические устройства. Screenshots: 105 основных снимков 21 экрана desktop/mobile/light/dark плюс 7 UAT/fullscreen, всего 112; [файлы](qa/runs/2026-09-30-final-regression-05/screenshots/). Три текущих снимка осмотрены вручную; автоматические проверки охватывают все 105 основных. Это не заявление о ручной проверке каждого пикселя каждого снимка.
