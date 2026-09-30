import pg from 'pg';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { staffClient } from '../tests/e2e/db-fixtures';
import { accounts } from '../tests/e2e/helpers';
import { qaPath } from './qa-paths.mjs';
const address = new URL(process.env.DATABASE_URL!);
if (!['localhost', '127.0.0.1'].includes(address.hostname) || address.port !== '56322')
  throw new Error('Local QA only');
const staff = await staffClient(),
  claims = (await staff.auth.getClaims()).data!.claims;
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
try {
  await db.query('begin');
  await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify(claims)]);
  const before = (
    await db.query('select last_active_at from private.admin_sessions where session_id=$1', [
      claims.session_id,
    ])
  ).rows[0].last_active_at;
  const session = (await db.query('select public.staff_session_status() result')).rows[0].result;
  assert.equal(typeof session.idleExpiresAt, 'string');
  assert.ok(Date.parse(session.absoluteExpiresAt) > Date.parse(session.serverTime));
  assert.equal(
    (
      await db.query('select last_active_at from private.admin_sessions where session_id=$1', [
        claims.session_id,
      ])
    ).rows[0].last_active_at.toISOString(),
    before.toISOString(),
    'status reads must not prolong the session',
  );
  for (let index = 0; index < 25; index++) {
    const id = randomUUID(),
      revision = randomUUID(),
      slug = `qa-pagination-${id}`;
    await db.query('insert into public.courses(id,slug,created_by) values($1,$2,$3)', [
      id,
      slug,
      accounts[0].id,
    ]);
    await db.query(
      'insert into public.course_revisions(id,course_id,slug,title,is_published) values($1,$2,$3,$4,true)',
      [revision, id, slug, `Pagination fixture ${index}`],
    );
    await db.query('update public.courses set published_revision_id=$1 where id=$2', [
      revision,
      id,
    ]);
  }
  const first = (await db.query('select public.analytics_page(1) result')).rows[0].result;
  const second = (await db.query('select public.analytics_page(2) result')).rows[0].result;
  assert.equal(first.courses.length, 20);
  assert.ok(second.courses.length > 0);
  assert.ok(first.totalCourses >= 25);
  assert.equal(first.totalCourses, second.totalCourses);
  assert.deepEqual(first.totals, second.totals);
  assert.ok(
    !first.courses.some((a: { id: string }) =>
      second.courses.some((b: { id: string }) => a.id === b.id),
    ),
  );
  assert.equal(
    (await db.query("select jsonb_array_length(public.analytics()->'courses') n")).rows[0].n,
    20,
    'legacy RPC is also bounded',
  );
  const entity = randomUUID();
  await db.query(
    "insert into public.audit_logs(actor_id,action,entity_type,entity_id) values($1,'course.publish','course',$2)",
    [accounts[0].id, entity],
  );
  const audit = (
    await db.query(
      "select public.audit_index('course.publish',$1,$2,'2020-01-01','2099-12-31',1) result",
      [accounts[0].email, entity],
    )
  ).rows[0].result;
  assert.equal(audit.total, 1);
  assert.equal(audit.items[0].entity_id, entity);
  assert.equal(audit.items[0].actor_id, accounts[0].id);
  const original = Number(
    (
      await db.query(
        "select count(*) n from public.audit_logs where action='video.provider_config'",
      )
    ).rows[0].n,
  );
  const fingerprint = randomBytes(32).toString('hex');
  for (let i = 0; i < 2; i++)
    await db.query("select public.observe_video_config('local',$1,true,false)", [fingerprint]);
  assert.equal(
    Number(
      (
        await db.query(
          "select count(*) n from public.audit_logs where action='video.provider_config'",
        )
      ).rows[0].n,
    ),
    original + 1,
    'same provider configuration is audited once',
  );
  assert.equal(
    (
      await db.query(
        "select has_function_privilege('authenticated','public.observe_video_config(text,text,boolean,boolean)','EXECUTE') allowed",
      )
    ).rows[0].allowed,
    false,
  );
  await db.query(
    "update private.admin_sessions set last_active_at=now()-interval '31 minutes' where session_id=$1",
    [claims.session_id],
  );
  let denied = false;
  try {
    await db.query('select public.staff_session_status()');
  } catch (error) {
    denied = !!error && typeof error === 'object' && 'code' in error && error.code === '42501';
  }
  assert.equal(denied, true);
  writeFileSync(
    qaPath('evidence/admin-surfaces.json'),
    JSON.stringify(
      {
        status: 'PASS',
        checks: [
          'session status is read-only',
          'expired session denied',
          'analytics pagination and global totals',
          'bounded legacy analytics RPC',
          'audit action/actor/entity/date filters',
          'provider configuration audit idempotency',
          'provider audit service-only permission',
        ],
        fixtures: 'transaction rolled back',
      },
      null,
      2,
    ),
  );
  console.log('PASS: seven Admin session, pagination and audit invariant groups');
} finally {
  await db.query('rollback');
  await db.end();
  await staff.auth.signOut({ scope: 'local' });
}
