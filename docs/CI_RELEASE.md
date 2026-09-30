# CI и выпуск

## Проверки

CI запускается для PR и push в main. Два независимых обязательных job: **Code checks** (Node 22, npm ci, typecheck, lint, unit, scoped coverage, production dependency audit, Gitleaks, build) и **Database security and E2E** (настоящий изолированный Supabase, миграции на пустой БД, bootstrap/MFA recovery, reset, двукратный seed, DB/RPC security, production build/server и core browser UAT).

Full QA использует тот же workflow с full=true: весь E2E, visual, public video, protected video. Запуск: push main, вручную workflow_dispatch, а также PR, меняющий workflow. Последнее позволяет проверить новый pipeline до появления workflow на default branch. Дополнительный job собирает Docker-образ и проверяет runtime. Внешние credentials никогда не передаются PR-коду. На main/manual реальные provider QA credentials берутся из GitHub Actions secrets с именами из .env.example. Их отсутствие даёт SKIP_EXTERNAL_CONFIGURATION / UNVERIFIED, не подтверждение live playback. Не добавляйте production credentials в QA.

Публичные видеосервисы проверяются настоящим Chrome под Xvfb. Их недоступность означает FAIL полного видеосценария: браузерные ограничения и недоступный источник нужно диагностировать, а не скрывать retry или подменой теста.

## Артефакты и секреты

Raw Playwright report, trace, test-results, auth/MFA failure screenshots, cookies, .env.local и server/Supabase stdout не публикуются. CI формирует отдельный HTML/JSON-отчёт только с названием теста, исходом и длительностью; ошибки сервера — только по белому списку полей (event/request UUID/type/time). Публикуются лишь screenshots перечисленных visual-экранов, где MFA/восстановление не открываются. Retention 14 дней. Стек-трейсы и raw assertion bodies остаются внутри временного runner и удаляются вместе с ним.

Gitleaks 8.30.1 выполняется локально по всей fetched Git history, без отправки находок. Архив CLI проверяется по закреплённому SHA256 официального релиза. Одно точечное историческое исключение — вымышленный RATE_LIMIT_SECRET unit-теста, никогда не использовавшийся в окружении. Исключения по всему файлу или типу секрета не применяются. Дополнительный scanner проверяет реальные runtime secrets и seed passwords/TOTP в исходниках, evidence и browser bundle. npm audit не заменяет эти проверки или RLS/E2E.

## Dependabot

Еженедельные PR для npm, Actions и Docker digest. Minor/patch npm объединяются; major обновления остаются отдельными. Автоматического merge нет. Любое обновление проходит CI и обычный PR. Actions закреплены по commit SHA.

## Release

Тег vMAJOR.MINOR.PATCH (необязательно prerelease suffix) запускает CI заново. Release job требует, чтобы commit принадлежал origin/main, собирает premium-lms:<tag> и premium-lms:<sha>, проверяет non-root/read-only runtime, health, отказ readiness при недоступной БД и отказ небезопасной production-конфигурации. После успеха создаёт GitHub Release с Docker tar.gz и SHA256SUMS. Registry и deployment не подразумеваются.

Docker: base image закреплён digest, npm — lockfile; OCI source/version/revision записываются при build. Это воспроизводимые входы сборки, а не заявление о битовой идентичности Next build: build ID, timestamps и toolchain могут менять digest. Образ не содержит .env, локальных аккаунтов или QA evidence. Обновляйте base digest через проверяемый PR.

Release workflow пока **UNVERIFIED** до настоящего выпуска по тегу. Создание тестового production release ради зелёного статуса не требуется. Статусы actual CI runs, Docker и защиты main фиксируются отдельно в RELEASE_READINESS и QA_REPORT после их выполнения.

Источники: [GitHub reusable workflows](https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows), [Gitleaks CLI](https://github.com/gitleaks/gitleaks), [GitHub branch protection API](https://docs.github.com/en/rest/branches/branch-protection).
