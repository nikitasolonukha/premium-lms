import { runtimeEnvironment } from '@/lib/server/env';
import { privilegedClient } from '@/lib/server/privileged';
import { readJsonBody } from '@/lib/bounded-body';
import { authenticateWebhook, telegramUpdate } from '../../../../workers/telegram.mjs';
export async function POST(request: Request) {
  const env = runtimeEnvironment();
  if (!env.TELEGRAM_BOT_TOKEN || env.TELEGRAM_MODE !== 'webhook')
    return new Response(null, { status: 503 });
  if (
    !authenticateWebhook(
      request.headers.get('x-telegram-bot-api-secret-token'),
      env.TELEGRAM_WEBHOOK_SECRET,
    )
  )
    return new Response(null, { status: 403 });
  try {
    const update = telegramUpdate(await readJsonBody(request.body, 16384));
    if (update) {
      const result = await privilegedClient().rpc('worker_api', {
        op: 'telegram',
        payload: update,
      });
      if (result.error) return new Response(null, { status: 503 });
    }
    return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return new Response(null, { status: 400 });
  }
}
