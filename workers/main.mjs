import { createClient } from '@supabase/supabase-js';
import { parseEnvironment } from '../src/lib/config.ts';
import { binaries, execute, videoJob } from './video.mjs';
import { telegramUpdate, telegramCall, deliverReport } from './telegram.mjs';
const env = parseEnvironment(process.env);
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
let stopping = false,
  active;
process.on('SIGINT', () => {
  stopping = true;
  active?.abort();
});
process.on('SIGTERM', () => {
  stopping = true;
  active?.abort();
});
async function rpc(op, payload = {}) {
  const { data, error } = await db.rpc('worker_api', { op, payload });
  if (error) throw new Error('WORKER_RPC_FAILED');
  if (data?.cancelled) throw new Error('OWNER_REVOKED');
  return data;
}
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let video = false;
try {
  const b = binaries(env);
  await execute(b.ffmpeg, ['-version']);
  await execute(b.ffprobe, ['-version']);
  video = true;
} catch {
  console.log('Video processor unavailable');
}
let botUsername,
  offset = 0;
async function poll() {
  if (!env.TELEGRAM_BOT_TOKEN || env.TELEGRAM_MODE !== 'poll') return;
  while (!stopping) {
    try {
      const updates = await telegramCall(env.TELEGRAM_BOT_TOKEN, 'getUpdates', {
        offset,
        timeout: 20,
        limit: 100,
        allowed_updates: ['message', 'callback_query'],
      });
      for (const update of updates) {
        const normalized = telegramUpdate(update);
        if (normalized) await rpc('telegram', normalized);
        offset = Math.max(offset, update.update_id + 1);
        if (update.callback_query?.id)
          await telegramCall(env.TELEGRAM_BOT_TOKEN, 'answerCallbackQuery', {
            callback_query_id: update.callback_query.id,
          }).catch(() => {});
      }
    } catch {
      await delay(10000);
    }
  }
}
if (env.TELEGRAM_BOT_TOKEN) {
  try {
    const me = await telegramCall(env.TELEGRAM_BOT_TOKEN, 'getMe', {});
    if (/^[A-Za-z0-9_]{5,32}$/.test(me.username)) botUsername = me.username;
  } catch {
    console.log('Telegram credentials could not be verified');
  }
}
void poll();
async function importJob(job, task) {
  for (let i = 0; i < job.payload.rows.length; i++) {
    if (job.result?.[String(i)]?.status === 'done') continue;
    const row = job.payload.rows[i];
    let found = await task('lookup', { row: i }),
      created = false;
    if (!found) {
      const invite = await db.auth.admin.inviteUserByEmail(row.email, {
        data: { first_name: row.first_name, last_name: row.last_name },
        redirectTo: `${env.APP_URL}/auth/callback?next=/reset-password`,
      });
      if (invite.error) {
        found = await task('lookup', { row: i });
        if (!found) throw new Error('IMPORT_FAILED');
      } else {
        found = { id: invite.data.user.id, role: 'student', disabled: false };
        created = true;
      }
    }
    if (found.role !== 'student' || found.disabled) throw new Error('IMPORT_FAILED');
    await task('import.row', { row: i, user_id: found.id, created });
  }
  await task('finish', { success: true });
}
console.log('Academy worker started');
while (!stopping) {
  try {
    await rpc('heartbeat', {
      video,
      telegram: !!env.TELEGRAM_BOT_TOKEN,
      telegram_mode: env.TELEGRAM_MODE,
      ...(botUsername ? { bot_username: botUsername } : {}),
    });
    await rpc('schedule');
    const job = await rpc('claim');
    if (!job) {
      await delay(5000);
      continue;
    }
    active = new AbortController();
    const task = (op, payload = {}) => rpc(op, { ...payload, job_id: job.id, lease: job.lease });
    const beat = setInterval(
      () => void task('progress', { progress: job.progress }).catch(() => active?.abort()),
      15000,
    );
    try {
      if (job.kind === 'import') await importJob(job, task);
      else if (job.kind === 'video') {
        if (!video) throw new Error('NOT_CONFIGURED');
        await videoJob(db, job, env, task, active.signal);
      } else {
        const report = await task('report');
        const result = await deliverReport(
          env.TELEGRAM_BOT_TOKEN,
          job,
          report,
          fetch,
          async (id) => task('report.receipt', { recipient: id }),
          async (id) => task('report.recipient', { recipient: id }),
        );
        await task('finish', { success: true, result });
      }
      console.log(`${job.kind}: completed`);
    } catch (error) {
      const permitted = ['NOT_CONFIGURED', 'DELIVERY_UNKNOWN', 'DELIVERY_FAILED', 'OWNER_REVOKED'];
      const code = permitted.includes(error.message)
        ? error.message
        : job.kind === 'import'
          ? 'IMPORT_FAILED'
          : job.kind === 'video'
            ? 'VIDEO_FAILED'
            : 'DELIVERY_FAILED';
      await task('finish', { success: false, error: code }).catch(() => {});
      console.log(`${job.kind}: ${code}`);
    } finally {
      clearInterval(beat);
      active = undefined;
    }
  } catch {
    console.log('Worker operation unavailable; retrying');
    await delay(10000);
  }
}
