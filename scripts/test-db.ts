import pg from 'pg';
import assert from 'node:assert/strict';
const connectionString =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:56322/postgres';
const url = new URL(connectionString);
if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.port !== '56322')
  throw new Error('Database tests are restricted to isolated local Supabase');
const db = new pg.Client({ connectionString });
await db.connect();
let passed = 0;
try {
  const tables = await db.query(
    "select tablename,rowsecurity from pg_tables where schemaname='public'",
  );
  assert.ok(
    tables.rows.some((r) => r.tablename === 'course_revisions'),
    'course_revisions exists',
  );
  assert.ok(
    tables.rows.every((r) => r.rowsecurity),
    'every public table has RLS',
  );
  passed++;
  const writes = await db.query(
    "select table_name,privilege_type from information_schema.role_table_grants where table_schema='public' and grantee in ('anon','authenticated') and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE')",
  );
  assert.equal(writes.rowCount, 0, 'no direct user mutation grants');
  passed++;
  const functions = await db.query(
    "select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef",
  );
  assert.equal(functions.rowCount, 0, 'no exposed SECURITY DEFINER functions');
  passed++;
  const bucket = await db.query("select public from storage.buckets where id='academy-private'");
  assert.equal(bucket.rows[0]?.public, false, 'learning bucket is private');
  const storage = await db.query(
    "select policyname from pg_policies where schemaname='storage' and tablename='objects'",
  );
  assert.equal(storage.rowCount, 0, 'no direct Storage permissions for users');
  passed++;
  await db.query('begin');
  const rates = [];
  for (let i = 0; i < 11; i++)
    rates.push(await db.query("select private.consume_limit('qa:atomic',10,600) retry"));
  assert.equal(rates.filter((r) => r.rows[0].retry === 0).length, 10);
  assert.ok(rates[10].rows[0].retry > 0);
  passed++;
  await db.query('rollback');
  console.log(`PASS: ${passed} database security invariant groups`);
} finally {
  await db.end();
}
