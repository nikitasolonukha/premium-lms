# Защищённое видео

Cloudflare Stream — приоритетный вариант; Mux поддерживается тем же серверным контрактом. Интеграции используют реальные API и RS256, но внешний playback в текущей среде **UNVERIFIED**: credentials и приватные QA assets **NOT CONFIGURED**. Локальные HTTP contracts используют имитацию ответов провайдера и настоящие RSA-подписи; они не заменяют live playback.

## Настройка

Задайте целиком одну или обе группы из `.env.example`. `VIDEO_PROVIDER` выбирает обязательную группу; полностью заданная дополнительная группа также доступна в CMS. Для Cloudflare нужны account ID, API token с чтением Stream, signing key ID, PEM/base64 PEM private key и точный `customer-….cloudflarestream.com` hostname. Создавайте/ротируйте ключ в кабинете или операторским API провайдера; приложение не выдаёт себе write permissions. Включите `requireSignedURLs=true` для каждого видео. Для Mux нужны API ID/secret с чтением Video и signing keys, signing key ID/private key и **signed playback ID**. У того же asset не должно быть public playback IDs. Источник должен завершить обработку.

Admin видит только полностью настроенные providers. Проверка API в Settings проверяет соединение и присутствие key ID; она не доказывает, что загруженный private key соответствует ключу провайдера или что поток воспроизводится. Проверяйте это live UAT. Секреты хранятся только в серверном secret store. В контенте хранится source ID, а не постоянный playback URL.

## Разрешение и обновление

`GET /api/playback/:lessonId/:blockId` проверяет живую сессию, подтверждённый email, лимит 30/min и `playback_context` от имени пользователя. RPC проверяет enrollment, published revision/lesson, sequential availability и отсутствие архива. `?preview=1` требует реальную staff-сессию с AAL2. После запроса metadata у провайдера контекст повторно читается перед подписью: concurrent revoke, публикация новой редакции и изменение preview не разрешают подписать устаревший источник.

TTL — **180 секунд**, обновление за 30 секунд до expiry. Ответы `private, no-store`. Cloudflare получает JWT в URL iframe, Mux — отдельные audience `v`, `t`, `s` для playback/thumbnail/storyboard. URL является временным bearer grant, его нельзя логировать или отправлять в аналитику. Отзыв enrollment/session запрещает новые grants; выданный grant может действовать до TTL. Provider caches и уже декодированные кадры не являются новым разрешением на скачивание.

При обновлении iframe восстанавливает последнюю наблюдаемую позицию и состояние pause/play. Cloudflare использует официальный Stream SDK с ограниченным ожиданием загрузки; Mux — минимальный transport опубликованной спецификации Player.js с проверкой origin **и** окна-источника и удалением listeners. Возможен короткий перезапуск iframe; браузер может потребовать повторный жест для autoplay. Ошибка обновления удаляет плеер и предлагает явный повтор. Обновление playback не продлевает staff idle/absolute session.

CSP добавляет только настроенный точный hostname Cloudflare, `https://player.mux.com` и Cloudflare SDK origin. Публичные YouTube/Vimeo/Rutube/direct/external остаются **PUBLIC VIDEO**. Прямой URL не считается защищённым потоком.

## Watermark

По умолчанию выключен. Admin выбирает masked email, short user ID или оба; интервал 5–120 секунд, opacity 0.15–0.65. Полный email не передаётся overlay. Reduced motion останавливает перемещение. Watermark не принимает pointer events и располагается вне нижней панели управления. Кнопка Академии разворачивает контейнер с плеером и watermark; native fullscreen/PiP внешнего провайдера и ограничения мобильного Safari могут исключать DOM overlay. Скачанные файлы и скриншоты watermark не защищает. Это не DRM.

## Проверки

- `npm test -- tests/unit/protected-video.test.ts tests/unit/player-bridge.test.ts tests/unit/watermark.test.ts` — crypto, unsafe metadata, malformed IDs, excessive TTL, late revocation, message spoofing и настройки.
- `npx tsx --env-file=.env.local scripts/test-playback-access.ts` — прямые RPC A/B/anonymous/staff-no-MFA, draft, sequential, revision publication, archive/revoke в локальной БД.
- `playback-client.spec.ts` — browser protocol emulator: позиция сохраняется после renewal, denial удаляет iframe. CSP специально обходится только в контексте этого emulator; это **не** внешний playback/CSP PASS.
- `protected-video.spec.ts` — новый курс/видео через Admin CMS, реальное воспроизведение A, отказ B, revoke и HTTP 401/403 для истёкшего manifest. Нужны серверные credentials и `QA_CLOUDFLARE_VIDEO_ID` / `QA_MUX_PLAYBACK_ID`. Без них **SKIP_EXTERNAL_CONFIGURATION**, результат **UNVERIFIED**.

Используйте только специально разрешённые QA videos, отдельные от платного production-контента. Traces, cookies, credentials и bearer URLs не сохраняются как evidence. Внешние сетевые блокировки или недоступный provider считаются FAIL выполненного теста, а не PASS.

Контракты: [Cloudflare signed playback](https://developers.cloudflare.com/stream/viewing-videos/securing-your-stream/), [Stream Player API](https://developers.cloudflare.com/stream/viewing-videos/using-the-stream-player/using-the-player-api/), [Mux signed playback](https://www.mux.com/docs/guides/secure-video-playback), [Mux iframe / Player.js](https://www.mux.com/docs/guides/player-advanced-usage), [Player.js specification](https://github.com/embedly/player.js/blob/master/SPEC.rst).
