import pg from 'pg';
import assert from 'node:assert/strict';
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
  await db.query("update public.user_roles set role='admin' where user_id=$1", [accounts[1].id]);
  await db.query('update public.profiles set disabled_at=now() where id=$1', [accounts[1].id]);
  await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify(claims)]);
  await db.query('set local role authenticated');
  assert.deepEqual(
    (await db.query('select public.set_user_disabled($1,true) result', [accounts[1].id])).rows[0]
      .result,
    { ok: true },
    'repeating disable on an already disabled Admin must be idempotent',
  );
  assert.deepEqual(
    (await db.query("select public.set_role($1,'student') result", [accounts[1].id])).rows[0]
      .result,
    { ok: true },
    'demoting an already disabled Admin must not remove the active last Admin',
  );
  for (const operation of [
    "select public.set_role($1,'student')",
    'select public.set_user_disabled($1,true)',
  ]) {
    await db.query('savepoint protected_admin');
    await assert.rejects(db.query(operation, [accounts[0].id]), /LAST_ADMIN/);
    await db.query('rollback to savepoint protected_admin');
  }
} finally {
  await db.query('rollback');
  await db.end();
  await staff.auth.signOut({ scope: 'local' });
}
writeFileSync(
  qaPath('evidence/role-guard.json'),
  JSON.stringify(
    {
      status: 'PASS',
      checks: [
        'repeated disabled Admin disable is idempotent',
        'disabled Admin demotion allowed',
        'active last Admin demotion denied',
        'active last Admin disable denied',
      ],
      scope: 'Real authenticated RPCs and database predicates; fixtures rolled back.',
    },
    null,
    2,
  ),
);
console.log('PASS: disabled Admin role can change while active last Admin stays protected.');
