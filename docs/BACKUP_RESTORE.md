# Backup manifest и проверка восстановления

База содержит Storage metadata, но не байты файлов. Сохраняйте DB dump и все физические объекты bucket вместе: оригиналы, .webp, .small.webp и .medium.webp. Manifest не содержит credentials. Сам dump содержит Auth/PII и должен храниться за пределами Git и публичных QA artifacts, с шифрованием и ограничением доступа.

## Формат

[backup-manifest.example.json](backup-manifest.example.json) — шаблон с нулевыми placeholder hash/size, а не готовая проверенная копия. Schema version 1: createdAt; application version/commit; consistency declaration; DB file, capturedAt, PostgreSQL/pg_dump 17 version, SHA256/bytes и упорядоченные migration versions; Storage capturedAt, buckets, object count/bytes и список bucket/key/file/MIME/size/SHA256 каждого объекта.

Пути: database.dump и storage/<bucket>/<original-object-key>. Используйте точные object keys, не пользовательские имена. Сохраняйте NFC и регистр; копия должна оставаться переносимой между ОС. Symlinks, traversal, дубликаты и посторонние файлы в storage inventory отклоняются. Manifest проверяется относительно миграций checkout соответствующего release; для старого backup сначала используйте совместимый tag, затем планируйте forward migrations.

Для согласованной копии остановите записи: публикации, uploads, назначения, progress и Auth mutations. Завершите начатые загрузки и зафиксируйте начало/конец окна. Объявление quiesced в manifest должно подтверждаться журналом оператора. Best-effort snapshot допустим для диагностики, но сам по себе не доказывает согласованность DB/Storage.

## Автоматическая проверка без изменений

```sh
npx tsx scripts/verify-backup.ts --manifest=/secure/backup/backup-manifest.json
npx tsx scripts/verify-backup.ts --manifest=/secure/backup/backup-manifest.json --check-archive
```

Первый режим потоково проверяет каждый SHA256, фактические bytes, полный файловый inventory, временные метки, schema/PG/migration versions и сигнатуру custom dump. Второй требует установленный PostgreSQL 17 pg_restore и проверяет реальный TOC/версии архива. Без него archive=UNVERIFIED. Hash не является подписью: доверие к происхождению manifest обеспечивается защищённым backup store и операторскими процедурами.

После восстановления в отдельную staging DB/Storage задайте operator DATABASE_URL, SUPABASE_URL и SUPABASE_SECRET_KEY через защищённый env-файл:

```sh
npx tsx --env-file=/secure/restore-verification.env scripts/verify-backup.ts --manifest=/secure/backup/backup-manifest.json --check-archive --verify-restored-db --verify-restored-storage
```

DB-проверка выполняется в READ ONLY transaction: PostgreSQL major, migration versions и Storage metadata inventory. Storage-проверка скачивает каждый объект целевого проекта и сверяет фактические bytes/SHA256. Соединение и ключи не выводятся. Команда ничего не восстанавливает, не удаляет и не изменяет, destructive mode отсутствует. Успех файловой проверки не означает, что restore или функциональный UAT уже прошёл.

## Restore rehearsal на staging

1. Выделить отдельный проект/БД, подтвердить его ID и отсутствие пользовательского трафика. Зафиксировать snapshot release, RPO/RTO и владельца rehearsal.
2. Проверить manifest/архив до restore. Соблюдать [процедуры Supabase backup/restore](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore) для managed schemas/roles. Custom pg_dump используется там, где operator имеет требуемые права; не заменять managed internal roles произвольным cluster dump.
3. Восстановить БД штатным инструментом оператора; затем физические Storage objects с теми же bucket/key/MIME. Не переключать DNS.
4. Запустить verifier с двумя target flags. До forward migrations checkout должен соответствовать snapshot. Затем применить проверенные forward migrations и заново экспортировать RLS_MATRIX.
5. При восстановлении чувствительного backup отозвать Auth sessions, выполнить вход и TOTP, проверить owner recovery отдельно.
6. Пройти restricted A/B course, published/draft isolation, images/files/playback, expiry/revoke, progress, audit, поиск и UAT. Сохранить безопасные результаты, фактическую длительность/RPO/RTO и release SHA.
7. Только после sign-off переключать инфраструктуру по deployment-плану. Временную staging-копию с PII удалять по отдельной операторской процедуре.

Текущая проверка: qa/runs/2026-09-30-backup-01/evidence/backup-verification.json — настоящий локальный custom archive и 262 Storage objects, 11 539 887 bytes. Это проверка read-only source snapshot/verifier, consistency=best-effort. Изолированное восстановление и staging UAT — UNVERIFIED. [Supabase backup limits](https://supabase.com/docs/guides/platform/backups).
