# Академия — Premium LMS

Русскоязычная LMS на Next.js 16.3.7, React 19.3.0, TypeScript и Supabase. Admin создаёт курсы/модули/уроки и 11 типов блоков, загружает материалы, публикует редакцию и назначает доступ через интерфейс. Editor меняет draft; Student видит только опубликованное доступное обучение.

**Статус: NOT READY.** Последний полный локальный E2E: 47 PASS, 0 FAIL, 2 live protected-video UNVERIFIED. Чистая установка, 78 unit-тестов, DB/security/UAT/visual, production build, Linux Docker с реальной БД и свежий backup прошли. Исправлено продление staff idle фоновым Next prefetch. Core GitHub CI PASS (13/13 E2E); обязательный Full QA FAIL: YouTube требует авторизацию на GitHub-hosted runner (46 PASS, 1 FAIL, 2 UNVERIFIED). Полные доказательства: [QA_REPORT](docs/QA_REPORT.md), [RELEASE_READINESS](docs/RELEASE_READINESS.md). Staging/production deployment не выполнялся.

Репозиторий: [nikitasolonukha/premium-lms](https://github.com/nikitasolonukha/premium-lms), [draft PR](https://github.com/nikitasolonukha/premium-lms/pull/1). Код, 17 migrations, tests, docs и безопасные QA evidence публичны; env/credentials/private backup/data/bundles не публикуются.

## Локальный запуск

Нужны Node.js 22+, npm и Docker Desktop Linux containers. Версии закреплены lockfile. Порты: app 3000, API 56321, PostgreSQL 56322, Mailpit 56324. Последний локальный Engine и все probes healthy; исторический outage сохранён в QA evidence.

```powershell
git clone https://github.com/nikitasolonukha/premium-lms.git
cd premium-lms
npm ci
npx supabase start --exclude studio,realtime,edge-runtime,logflare,vector,supavisor,imgproxy
npm run setup:local
# Только отдельная локальная QA-БД:
npx supabase db reset --local --no-seed
npm run seed
npm run dev
```

Откройте http://localhost:3000; тестовые письма — http://localhost:56324. Seed local-only, повторяемый: 5 accounts, 3 courses, 6 modules, 12 lessons, все 11 блоков/форматы. Passwords/TOTP генерируются в ignored .local/seed-accounts.json. Admin/Editor используют TOTP SHA-1, 6 digits, 30 seconds. Первый настоящий Admin подключает собственный MFA через bootstrap из OPERATIONS. Не запускайте seed/reset на production; не запускайте npm ci параллельно работающему Supabase CLI на Windows.

## Проверки

```powershell
npm run typecheck
npm run lint
npm test
npm run test:coverage
npm run test:db
npm run test:performance
npm run test:security
npm run build
npm start
# Другой терминал, healthy isolated Supabase:
npx playwright install chromium
npm run e2e
npm run test:backup
npm audit --omit=dev
npm run security:install
npm run security:secrets
npm run security:client
```

Operator empty-DB scenarios: npm run test:operations **до seed**, затем отдельный reset перед demo/security fixtures: bootstrap оставляет собственного Admin. Security/performance/seed/reset fixtures restricted to local 56321/56322. Browser tests sequential; rate fixture очищает только counters между независимыми сценариями, сами limits и 429/Retry-After проверяются. Coverage относится к выбранным 16 критическим модулям, не ко всей платформе.

Public video тест использует настоящий установленный Google Chrome с GUI/Widevine и сеть, без пользовательского профиля; Linux CI использует Xvfb. Разрешённые альтернативные examples задаются QA_YOUTUBE_URL/QA_VIMEO_URL/QA_RUTUBE_URL. Provider refusal не подменяется mock/PASS. Cloudflare/Mux live tests требуют real QA credentials/source IDs; иначе явный SKIP_EXTERNAL_CONFIGURATION/UNVERIFIED.

Не запускайте Docker build одновременно с browser QA на малоресурсной VM. Допустимо остановить только собственные семь LMS containers, сохранив volumes, затем восстановить их; shared Docker/WSL restart и другие проекты требуют согласованного окна.

## Production hardening

Реальные Cloudflare Stream/Mux adapters: server RS256, source inspection, 180-second grants, повторная access/session/revision/sequence проверка перед подписью, CMS config gating и player renewal. Credentials и live assets сейчас NOT CONFIGURED. Watermark masked email/ID с interval/opacity и LMS fullscreen не является DRM.

Private Storage, HMAC download namespace/60-second TTL, prepared WebP 480/960/1800, ZIP CRC/expansion/path/macro и PDF active-content rejection сохранены/усилены. External malware scanner имеет реальный контракт; disabled возвращает SKIPPED, не CLEAN. Staff MFA/live session/12h absolute/30min idle, near-expiry warning и explicit continuation; audit filters и readonly events. Shared RLS predicates кешируются в пределах одного SQL statement; row-dependent access сохранён.

Strict local/staging/production env, explicit trusted-proxy ACK, UUID logs, DB health/ready, optional sanitized Sentry, CSP/HSTS и same-origin guards. CI/Full QA/tag Release/Dependabot реализованы; main protection, alerts/secret scanning/push protection фактически включены. Restore, SMTP, domain, monitoring и protected live требуют настоящей staging проверки.

## Документация

- [ARCHITECTURE](docs/ARCHITECTURE.md), [SECURITY](docs/SECURITY.md), [RLS_MATRIX](docs/RLS_MATRIX.md), [MUTATION_AUDIT](docs/MUTATION_AUDIT.md).
- [OPERATIONS](docs/OPERATIONS.md): Vercel/Supabase и Docker/reverse proxy, bootstrap/MFA recovery/SMTP/monitoring.
- [PROTECTED_VIDEO](docs/PROTECTED_VIDEO.md), [UPLOAD_SECURITY](docs/UPLOAD_SECURITY.md), [STAFF_SECURITY](docs/STAFF_SECURITY.md).
- [BACKUP_RESTORE](docs/BACKUP_RESTORE.md), [STAGING_CHECKLIST](docs/STAGING_CHECKLIST.md), [PRODUCTION_UAT](docs/PRODUCTION_UAT.md).
- [QA_REPORT](docs/QA_REPORT.md), [RELEASE_READINESS](docs/RELEASE_READINESS.md), [GITHUB_PROTECTION](docs/GITHUB_PROTECTION.md), [CSS_ORGANIZATION](docs/CSS_ORGANIZATION.md).

Новые evidence/screenshots — docs/qa/runs/<run-id>/; исторические материалы сохранены отдельно. Release levels: NOT READY → CODE READY FOR STAGING → READY FOR PRODUCTION DEPLOYMENT → PRODUCTION VERIFIED, каждый после своих реальных gates. Payments/community/exams/certificates/SSO/DRM остаются extension points.
