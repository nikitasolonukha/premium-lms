import { staffClient, fixtureCourse, document as readDocument } from '../tests/e2e/db-fixtures';
import { accounts } from '../tests/e2e/helpers';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import pg from 'pg';
const db = await staffClient(),
  doc = await fixtureCourse(db),
  sql = new pg.Client({ connectionString: process.env.DATABASE_URL });
await sql.connect();
try {
  const lesson = doc.modules[0].lessons[0];
  doc.modules = Array.from({ length: 3 }, (_, i) => ({
    id: randomUUID(),
    title: `Модуль ${i + 1}`,
    lessons: Array.from({ length: 100 }, (_, j) => ({
      ...lesson,
      id: randomUUID(),
      slug: `lesson-${i}-${j}`,
      blocks: lesson.blocks
        .filter((b) => b.type === 'rich_text')
        .map((b) => ({ ...b, id: randomUUID() })),
    })),
  }));
  const saved = await db.rpc('save_course', { doc, expected_version: doc.version });
  assert.equal(saved.error, null);
  assert.equal(
    (await db.rpc('publish_course', { cid: doc.id, expected_version: saved.data.version })).error,
    null,
  );
  assert.equal(
    (await db.rpc('set_access', { cid: doc.id, target_user: accounts[2].id, enabled: true })).error,
    null,
  );
  const ids = doc.modules.flatMap((m) => m.lessons.map((l) => l.id));
  await sql.query(
    'insert into public.progress(user_id,lesson_id,course_id,completed_at) select $1,id,$2,now() from unnest($3::uuid[]) id',
    [accounts[2].id, doc.id, ids.slice(0, 299)],
  );
  const student = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  assert.equal(
    (
      await student.auth.signInWithPassword({
        email: accounts[2].email,
        password: accounts[2].password,
      })
    ).error,
    null,
  );
  const start = performance.now();
  const progress = await student.rpc('course_progress', { cid: doc.id });
  assert.equal(progress.error, null);
  assert.equal(progress.data.length, 299);
  const catalog = await student.rpc('catalog', { q: doc.title });
  assert.equal(catalog.error, null);
  const card = catalog.data.items.find((c: { id: string }) => c.id === doc.id);
  assert.equal(card.progress, 99);
  assert.equal(card.lesson_count, 300);
  assert.equal(card.completed_count, 299);
  const elapsed = Math.round(performance.now() - start);
  assert.ok(elapsed < 10000, 'Local progress+catalog should finish within ten seconds');
  assert.equal((await readDocument(db, doc.id)).modules.flatMap((m) => m.lessons).length, 300);
  writeFileSync(
    'docs/qa/evidence/scale-progress.json',
    JSON.stringify(
      {
        status: 'PASS',
        executedAt: new Date().toISOString(),
        lessons: 300,
        completed: 299,
        progress: 99,
        readMilliseconds: elapsed,
        checks: [
          'REST row limit does not truncate progress',
          '100% reserved for fully completed courses',
          'catalog current published denominator',
          '300-lesson document roundtrip',
        ],
      },
      null,
      2,
    ),
  );
  console.log(`PASS: 300 lessons, 299 completions, 99%; progress+catalog ${elapsed}ms`);
} finally {
  await db.rpc('delete_course', { cid: doc.id });
  await sql.end();
}
