# Проверка загрузок и изображения

Учебные файлы загружают только Admin/Editor с AAL2, аватары пользователей — отдельная ограниченная категория изображений. Расширение, заявленный MIME, сигнатура и размер проверяются повторно при finalize, включая intents, созданные напрямую через RPC. Изображения декодируются Sharp с лимитом 40 млн пикселей, без анимации; metadata удаляется при перекодировании. Branding/avatar ограничены 5 MiB, учебные материалы — 50 MiB.

ZIP/DOCX/XLSX читаются последовательно через yauzl с проверкой действительного размера распакованных байтов и CRC32. Лимиты: 2 000 entries, 50 MiB на файл, 200 MiB суммарно, отношение сжатия до 200, 15 секунд на обработку. Запрещены traversal, абсолютные/неоднозначные пути, symlinks, шифрованные entries, дубли имён с учётом регистра/NFC, макросы, исполняемые вложения и вложенные архивы. Office XML проверяется на макросы/DTD/entities/DDE/OLE. Поддерживаются ZIP store/deflate; другие алгоритмы и UTF-16 Office XML отклоняются. Это проверка структуры и известных опасных конструкций, не доказательство отсутствия malware.

PDF проверяется на активные действия с декодированием `#XX` в именах. PDF с шифрованием и `/ObjStm` (сжатые объекты, содержимое которых этот gate не инспектирует) **отклоняются**. Такой PDF необходимо заново экспортировать в совместимом виде без этих возможностей. Обычное сжатие текстовых/графических потоков разрешено. Это намеренно ограниченный формат допуска; полноценного PDF sandbox/антивируса нет.

## MalwareScanner

`MALWARE_SCANNER=disabled` возвращает **skipped / NOT_CONFIGURED**, не CLEAN. Внешний режим требует `MALWARE_SCANNER=external`, HTTPS `MALWARE_SCANNER_URL` без credentials/query и `MALWARE_SCANNER_TOKEN`. Частичная конфигурация останавливает приложение.

Контракт gateway: POST raw bytes с `Content-Type: application/octet-stream`, Bearer auth и `X-Content-SHA256`; ответ не более 1 KiB — `{"status":"clean"|"infected","sha256":"<digest тех же bytes>"}`. Gateway должен синхронно дождаться действительного verdict собственного antivirus engine. Redirect запрещён, timeout 20 секунд. Имя файла, email, user ID и signed URL не передаются. Неправильный hash, HTTP ошибка, timeout или неизвестный verdict не превращаются в clean. Outage оставляет intent pending для явного повторного finalize. External backend в текущей среде **NOT CONFIGURED**, live scan **UNVERIFIED**; тесты контракта используют имитацию HTTP.

Если учебные документы/архивы разрешат загружать Student или внешним авторам, действительный antivirus gateway станет обязательным. Существующее разрешение Student на небольшой перекодируемый avatar не открывает загрузку учебных файлов.

## Финализация и выдача изображений

Варианты small/medium/large (480/960/1800 px, без увеличения оригинала) создаются **до** статуса ready. GET принимает только `size=small|medium|large`; произвольная ширина не обрабатывается. API не запускает image transform. Ссылка выдаётся после RLS, TTL до 300 секунд. `<img srcset>` выбирает вариант под viewport; карточки/аватары/таблицы запрашивают уменьшенные размеры. Приватные изображения исключены из общего оптимизационного кэша.

`variant_version=0` сохраняет совместимость с прежним `.webp`. Для старых данных выполните операторский `npx tsx --env-file=<operator-env> scripts/backfill-image-variants.ts`: по умолчанию dry run; `--apply` создаёт до 100 пар small/medium за запуск и затем отмечает готовность. Оригинал и прежний large не перезаписываются. Повторяйте до отсутствия кандидатов. Backup должен включать оригинал, `.webp`, `.small.webp`, `.medium.webp`.

После decoding/scanning `finalize_media_v2` повторно проверяет настоящую Auth session, disabled user и staff idle/absolute limits. Только service_role может вызвать эту узкую операцию. Неудачный дублирующий запрос не переводит ready в rejected и не удаляет файлы, если другой запрос уже завершил загрузку. Очистка выполняется только при успешном переходе pending → rejected. Abandoned intents очищаются операторским `cleanup-media.ts`, включая все варианты.

Проверки: unit `upload-inspection`, `malware-scanner`, `image-variants`, `config`; DB `scripts/test-media-finalize.ts`; production E2E `media`, `repeat-upload`, `uat`. Фактический статус прогонов фиксируется отдельно в текущем QA_REPORT.
