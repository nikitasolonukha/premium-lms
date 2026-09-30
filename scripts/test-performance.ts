import pg from 'pg';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { staffClient } from '../tests/e2e/db-fixtures';
import { accounts } from '../tests/e2e/helpers';
import { qaPath } from './qa-paths.mjs';
const address = new URL(process.env.DATABASE_URL!);
if (!['127.0.0.1', 'localhost'].includes(address.hostname) || address.port !== '56322')
  throw new Error('Local performance QA only');
const staff = await staffClient(),
  claims = (await staff.auth.getClaims()).data!.claims;
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
const count = 300,
  marker = 'perf-' + randomUUID();
const rows = Array.from({ length: count }, (_, i) => ({
  id: randomUUID(),
  revision: randomUUID(),
  module: randomUUID(),
  lesson: randomUUID(),
  asset: randomUUID(),
  block: randomUUID(),
  user: randomUUID(),
  ordinal: i,
}));
const results: {
  area: string;
  pageSize: number;
  total: number;
  responseBytes: number[];
  durationMs: number[];
  staffChecks: number[];
  explain: unknown[];
}[] = [];
await db.connect();
try {
  await db.query('begin');
  await db.query("set local statement_timeout='30s'");
  await db.query("set local track_functions='all'");
  await db.query(
    'create temporary table perf_fixture(id uuid, revision uuid,module uuid,lesson uuid,asset uuid,block uuid,"user" uuid,ordinal integer) on commit drop',
  );
  await db.query(
    'insert into perf_fixture select * from jsonb_to_recordset($1::jsonb) as x(id uuid,revision uuid,module uuid,lesson uuid,asset uuid,block uuid,"user" uuid,ordinal integer)',
    [JSON.stringify(rows)],
  );
  await db.query(
    "insert into auth.users(id,aud,role,email,email_confirmed_at,raw_user_meta_data,raw_app_meta_data,created_at,updated_at) select \"user\",'authenticated','authenticated',$1||'-'||ordinal||'@academy.local',now(),jsonb_build_object('first_name','Performance'), '{}'::jsonb,now(),now() from perf_fixture",
    [marker],
  );
  await db.query(
    "insert into public.courses(id,slug,created_by) select id,'perf-'||id::text,$1 from perf_fixture",
    [accounts[0].id],
  );
  await db.query(
    "insert into public.course_revisions(id,course_id,slug,title,is_published,access_mode) select revision,id,'perf-'||id::text,$1||'-'||ordinal,true,'registered' from perf_fixture",
    [marker],
  );
  await db.query(
    'update public.courses c set published_revision_id=f.revision from perf_fixture f where c.id=f.id',
  );
  await db.query('insert into public.modules(id,course_id) select module,id from perf_fixture');
  await db.query('insert into public.lessons(id,course_id) select lesson,id from perf_fixture');
  await db.query(
    "insert into public.module_revisions(revision_id,course_id,module_id,title,position) select revision,id,module,'Performance module',0 from perf_fixture",
  );
  await db.query(
    "insert into public.lesson_revisions(revision_id,course_id,lesson_id,module_id,slug,title,position) select revision,id,lesson,module,'performance-lesson','Performance lesson',0 from perf_fixture",
  );
  await db.query(
    "insert into public.media(id,owner_id,object_key,filename,mime_type,size_bytes,status) select asset,$1,'performance/'||asset::text,$2||'-'||ordinal||'.pdf','application/pdf',32,'ready' from perf_fixture",
    [accounts[0].id, marker],
  );
  await db.query(
    "insert into public.lesson_blocks(revision_id,lesson_id,id,position,type,data) select revision,lesson,block,0,'file',jsonb_build_object('assetId',asset,'title','Performance file') from perf_fixture",
  );
  await db.query(
    'insert into public.block_assets(revision_id,block_id,media_id) select revision,block,asset from perf_fixture',
  );
  await db.query(
    "insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata) select $1,'course.publish','course',$2||'-'||ordinal,'{}'::jsonb from perf_fixture",
    [accounts[0].id, marker],
  );
  await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify(claims)]);
  await db.query('set local role authenticated');
  for (const area of ['catalog', 'library', 'users', 'analytics', 'audit'] as const) {
    const call =
      area === 'catalog'
        ? 'public.catalog(q=>$1,page=>$2,staff=>true)'
        : area === 'library'
          ? 'public.library(q=>$1,page=>$2)'
          : area === 'users'
            ? 'public.list_users(q=>$1,page=>$2)'
            : area === 'analytics'
              ? 'public.analytics_page($2)'
              : 'public.audit_index(q_entity=>$1,page=>$2)';
    // PostgreSQL cannot infer an unused parameter: preserve the fixed signature for analytics.
    const query =
      area === 'analytics'
        ? 'select public.analytics_page($1) result'
        : 'select ' + call + ' result';
    const pages: { items: { id: string }[]; total: number }[] = [],
      durationMs: number[] = [],
      responseBytes: number[] = [],
      staffChecks: number[] = [],
      plans: unknown[] = [];
    for (const page of [1, 2]) {
      const args = area === 'analytics' ? [page] : [marker, page];
      const tracked = async () =>
        Number(
          (
            await db.query(
              "select coalesce(sum(calls),0) calls from pg_stat_xact_user_functions where schemaname='private' and funcname='staff_identity'",
            )
          ).rows[0].calls,
        );
      const before = await tracked();
      const start = performance.now(),
        result = (await db.query(query, args)).rows[0].result;
      durationMs.push(Math.round((performance.now() - start) * 100) / 100);
      staffChecks.push((await tracked()) - before);
      assert.ok(!result.error, 'RPC must not return an error');
      const items = area === 'analytics' ? result.courses : result.items;
      const total = area === 'analytics' ? result.totalCourses : result.total;
      const size = area === 'catalog' ? 12 : area === 'audit' ? 30 : 20;
      assert.equal(items.length, size, area + ' page must be bounded and full on large fixture');
      assert.ok(total >= count);
      responseBytes.push(Buffer.byteLength(JSON.stringify(result)));
      assert.ok(responseBytes.at(-1)! < 100000, area + ' bounded response payload');
      pages.push({ items, total });
      plans.push(
        (await db.query('explain (analyze,buffers,format json) ' + query, args)).rows[0][
          'QUERY PLAN'
        ],
      );
    }
    assert.equal(pages[0].total, pages[1].total);
    assert.ok(
      !pages[0].items.some((a) => pages[1].items.some((b) => a.id === b.id)),
      area + ' pages cannot overlap',
    );
    results.push({
      area,
      pageSize: pages[0].items.length,
      total: pages[0].total,
      responseBytes,
      durationMs,
      staffChecks,
      explain: plans,
    });
    // Count actual nested authorization calls, independent of machine speed.
    // Staff lists need one shared role/session check, plus lesson-specific checks
    // in library; they must not repeat the shared check across every joined row.
    if (area === 'catalog' || area === 'library')
      assert.ok(
        Math.max(...staffChecks) < (area === 'catalog' ? count / 2 : count * 2),
        `${area}: excessive shared staff identity checks (${staffChecks.join(',')})`,
      );
  }
} finally {
  await db.query('rollback');
  await db.end();
  await staff.auth.signOut({ scope: 'local' });
}
writeFileSync(
  qaPath('evidence/performance-pagination.json'),
  JSON.stringify(
    {
      status: 'PASS',
      fixturesPerEntity: count,
      results,
      scope:
        'Real authenticated RPC calls with 300 transactional course/user/file/audit metadata fixtures, rolled back. No Storage bytes or usable Auth passwords created. EXPLAIN covers RPC boundaries; nested PL/pgSQL plans are opaque, so this is not proof of every internal scan or a load SLA. No new indexes or server settings introduced.',
    },
    null,
    2,
  ),
);
console.log(
  'PASS: five real list RPCs preserve bounded, disjoint pages on transactional large fixtures.',
);
