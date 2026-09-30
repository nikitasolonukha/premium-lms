import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import { prepareImageVariants, imageVariantKey } from '../src/lib/image-variants';
if (!process.env.DATABASE_URL) throw new Error('Set operator DATABASE_URL');
const apply = process.argv.includes('--apply');
if (process.argv.slice(2).some((arg) => arg !== '--apply'))
  throw new Error('Usage: backfill-image-variants.ts [--apply]');
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
let updated = 0;
try {
  await db.query("select pg_advisory_lock(hashtext('academy-image-backfill'))");
  const { rows } = await db.query<{ id: string; object_key: string }>(
    "select id,object_key from public.media where status='ready' and mime_type like 'image/%' and variant_version=0 order by created_at,id limit 100",
  );
  if (!apply)
    console.log(
      `DRY RUN: ${rows.length} legacy images in the next batch; no objects or rows changed. Use --apply.`,
    );
  else {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY)
      throw new Error('Set operator Storage credentials');
    const storage = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
      auth: { persistSession: false },
    }).storage.from('academy-private');
    for (const row of rows) {
      const downloaded = await storage.download(row.object_key);
      if (downloaded.error)
        throw new Error('Could not read an original image; batch may be resumed');
      const variants = await prepareImageVariants(
        new Uint8Array(await downloaded.data.arrayBuffer()),
      );
      // The existing large derivative is preserved byte-for-byte.
      for (const variant of variants.filter((item) => item.size !== 'large')) {
        const result = await storage.upload(
          imageVariantKey(row.object_key, variant.size, 1),
          variant.bytes,
          { contentType: 'image/webp', upsert: false },
        );
        if (result.error && !result.error.message.toLowerCase().includes('already exists'))
          throw new Error('Could not write derivative; rerun to resume');
      }
      const changed = await db.query(
        "update public.media set variant_version=1 where id=$1 and status='ready' and variant_version=0",
        [row.id],
      );
      updated += changed.rowCount ?? 0;
    }
    console.log(`Prepared responsive derivatives for ${updated} images; originals preserved.`);
  }
} finally {
  await db.end();
}
