import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY)
  throw new Error('Set operator Supabase environment');
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const cutoff = new Date(Date.now() - 24 * 3600000).toISOString();
// Signed upload grants expire well before this grace period. No ready object is removed.
if (!process.env.DATABASE_URL) throw new Error('Set operator DATABASE_URL');
const sql = new pg.Client({ connectionString: process.env.DATABASE_URL });
await sql.connect();
let cleaned = 0;
try {
  await sql.query("select pg_advisory_lock(hashtext('academy-media-cleanup'))");
  const { rows } = await sql.query<{ id: string; object_key: string }>(
    "update public.media set status='rejected' where id in (select id from public.media where status in ('pending','rejected') and created_at<$1 order by created_at limit 100 for update skip locked) and status in ('pending','rejected') returning id,object_key",
    [cutoff],
  );
  for (const item of rows) {
    const removed = await db.storage
      .from('academy-private')
      .remove([item.object_key, `${item.object_key}.webp`]);
    if (removed.error) throw new Error('Storage cleanup failed; rerun to retry rejected objects');
    await sql.query("update public.media set status='deleted' where id=$1 and status='rejected'", [
      item.id,
    ]);
    cleaned++;
  }
} finally {
  await sql.end();
}
console.log(
  `Rejected and cleaned ${cleaned} abandoned upload intents; no ready assets were selected.`,
);
