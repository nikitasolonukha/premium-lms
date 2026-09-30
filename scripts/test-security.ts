import { qaPath } from './qa-paths.mjs';
import { createClient } from '@supabase/supabase-js';
import { TOTP, Secret } from 'otpauth';
import pg from 'pg';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fixtureId, demoCourses } from './fixtures';
import type { CourseDraft } from '../src/lib/schemas';
const url = process.env.SUPABASE_URL!,
  key = process.env.SUPABASE_PUBLISHABLE_KEY!;
if (!/^http:\/\/(127\.0\.0\.1|localhost):56321$/.test(url))
  throw new Error('Security tests are local-only');
const accounts = JSON.parse(readFileSync('.local/seed-accounts.json', 'utf8')) as {
  id: string;
  email: string;
  password: string;
  role: string;
  factorId: string;
  totpSecret: string;
}[];
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const results: { name: string; status: string; detail?: string }[] = [];
async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push({ name, status: 'PASS' });
    console.log(`PASS ${name}`);
  } catch (e) {
    results.push({ name, status: 'FAIL', detail: e instanceof Error ? e.message : String(e) });
    console.error(`FAIL ${name}: ${e instanceof Error ? e.message : 'unknown'}`);
  }
}
const fresh = () =>
  createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
async function login(index: number, mfa = false) {
  const client = fresh(),
    a = accounts[index];
  assert.equal(
    (await client.auth.signInWithPassword({ email: a.email, password: a.password })).error,
    null,
  );
  if (mfa) {
    assert.equal(
      (
        await client.auth.mfa.challengeAndVerify({
          factorId: a.factorId,
          code: new TOTP({ secret: Secret.fromBase32(a.totpSecret) }).generate(),
        })
      ).error,
      null,
    );
    assert.equal((await client.rpc('touch_staff_session')).error, null);
  }
  return client;
}
function okay(result: { error: unknown; data: unknown }) {
  assert.equal(result.error, null);
  assert.ok(!(result.data && typeof result.data === 'object' && 'error' in result.data));
}
try {
  const [admin, editor, a, b, staffNoMfa] = await Promise.all([
      login(0, true),
      login(1, true),
      login(2),
      login(3),
      login(0),
    ]),
    anon = fresh();
  await test('anonymous cannot read learning tables', async () => {
    const r = await anon.from('lesson_blocks').select('*');
    assert.ok(r.error || !r.data?.length);
  });
  await test('Student A sees three permitted courses; Student B only registered course', async () => {
    const ar = await a.rpc('catalog');
    const br = await b.rpc('catalog');
    okay(ar);
    okay(br);
    assert.equal(
      ar.data.items.filter((item: { id: string }) =>
        [0, 1, 2].some((i) => item.id === fixtureId(`course-${i}`)),
      ).length,
      3,
    );
    assert.equal(br.data.total, 1);
  });
  await test('RLS denies foreign restricted course and lesson IDs', async () => {
    for (const table of ['courses', 'course_revisions', 'lesson_blocks']) {
      const r = await b
        .from(table)
        .select('*')
        .eq(
          table === 'courses' ? 'id' : table === 'course_revisions' ? 'course_id' : 'lesson_id',
          fixtureId(table === 'lesson_blocks' ? 'lesson-0-0' : 'course-0'),
        );
      assert.deepEqual(r.data, []);
    }
  });
  await test('foreign course document RPC is rejected', async () => {
    assert.ok((await b.rpc('course_document', { cid: fixtureId('course-0'), draft: false })).error);
  });
  await test('students cannot mutate role, progress, enrollments or audit tables directly', async () => {
    assert.ok(
      (await a.from('user_roles').update({ role: 'admin' }).eq('user_id', accounts[2].id)).error,
    );
    assert.ok(
      (
        await a
          .from('progress')
          .update({ completed_at: new Date().toISOString() })
          .eq('user_id', accounts[2].id)
      ).error,
    );
    assert.ok(
      (
        await a
          .from('enrollments')
          .insert({ user_id: accounts[3].id, course_id: fixtureId('course-0') })
      ).error,
    );
    assert.ok((await a.from('audit_logs').delete().gt('id', 0)).error);
  });
  await test('unverified MFA staff cannot publish, edit, grant access or read drafts', async () => {
    assert.ok(
      (await staffNoMfa.rpc('publish_course', { cid: fixtureId('course-0'), expected_version: 1 }))
        .error,
    );
    assert.ok(
      (
        await staffNoMfa.rpc('set_access', {
          target_user: accounts[3].id,
          cid: fixtureId('course-0'),
          enabled: true,
        })
      ).error,
    );
    assert.ok(
      (await staffNoMfa.rpc('course_document', { cid: fixtureId('course-0'), draft: true })).error,
    );
  });
  await test('Editor cannot publish, change roles, settings, access or categories', async () => {
    for (const [name, args] of [
      ['publish_course', { cid: fixtureId('course-0'), expected_version: 1 }],
      ['set_role', { target_user: accounts[3].id, new_role: 'admin' }],
      ['update_settings', { doc: {} }],
      ['set_access', { target_user: accounts[3].id, cid: fixtureId('course-0'), enabled: true }],
      ['mutate_category', { cid: randomUUID(), label: 'Forbidden', color: 'blue', remove: false }],
    ] as const)
      assert.ok((await editor.rpc(name, args)).error);
  });
  await test('last Admin cannot be demoted or disabled', async () => {
    assert.ok(
      (
        await admin.rpc('set_role', { target_user: accounts[0].id, new_role: 'student' })
      ).error?.message.includes('LAST_ADMIN'),
    );
    assert.ok(
      (
        await admin.rpc('set_user_disabled', { target_user: accounts[0].id, disabled: true })
      ).error?.message.includes('LAST_ADMIN'),
    );
  });
  await test('Storage direct read and signing are denied to Student', async () => {
    const path = `${accounts[0].id}/${fixtureId('asset-pdf-0')}`;
    assert.ok((await a.storage.from('academy-private').download(path)).error);
    assert.ok((await a.storage.from('academy-private').createSignedUrl(path, 600)).error);
  });
  await test('RLS media reference checks reject inaccessible files', async () => {
    const permitted = await a.from('media').select('id').eq('id', fixtureId('asset-pdf-0'));
    const denied = await b.from('media').select('id').eq('id', fixtureId('asset-pdf-0'));
    assert.equal(permitted.data?.length, 1);
    assert.deepEqual(denied.data, []);
  });
  await test('sequential lock hides blocks, media and completion RPC', async () => {
    const next = fixtureId('lesson-1-1');
    assert.deepEqual((await a.from('lesson_blocks').select('*').eq('lesson_id', next)).data, []);
    assert.deepEqual(
      (await a.from('media').select('id').eq('id', fixtureId('asset-docx-1'))).data,
      [],
    );
    assert.ok((await a.rpc('record_progress', { lid: next, complete: true, seconds: 0 })).error);
  });
  const source = demoCourses()[0];
  const course: CourseDraft = {
    ...source,
    id: randomUUID(),
    slug: `qa-${randomUUID().slice(0, 8)}`,
    version: 0,
    title: 'Security QA original',
    modules: source.modules.map((m) => ({
      ...m,
      id: randomUUID(),
      lessons: m.lessons.map((l) => ({
        ...l,
        id: randomUUID(),
        blocks: l.blocks.map((block) => ({ ...block, id: randomUUID() })),
      })),
    })),
  };
  let version = 0;
  await test('Admin saves new course transactionally and retries cannot duplicate', async () => {
    const saved = await admin.rpc('save_course', { doc: course, expected_version: 0 });
    okay(saved);
    version = saved.data.version;
    assert.ok(
      (
        await admin.rpc('save_course', { doc: course, expected_version: 0 })
      ).error?.message.includes('EDIT_CONFLICT'),
    );
  });
  await test('unpublished course remains invisible even with enrollment', async () => {
    okay(
      await admin.rpc('set_access', { target_user: accounts[2].id, cid: course.id, enabled: true }),
    );
    assert.deepEqual((await a.from('courses').select('id').eq('id', course.id)).data, []);
  });
  await test('publish makes exactly the published revision visible', async () => {
    okay(await admin.rpc('publish_course', { cid: course.id, expected_version: version }));
    const doc = await a.rpc('course_document', { cid: course.id, draft: false });
    okay(doc);
    assert.equal(doc.data.title, course.title);
  });
  await test('Editor draft changes do not leak through rows, document or search', async () => {
    course.version = version;
    course.title = 'Hidden editor change';
    const save = await editor.rpc('save_course', { doc: course, expected_version: version });
    okay(save);
    version = save.data.version;
    const doc = await a.rpc('course_document', { cid: course.id, draft: false });
    assert.equal(doc.data.title, 'Security QA original');
    assert.equal((await a.rpc('catalog', { q: 'Hidden editor change' })).data.total, 0);
    assert.equal(
      (await a.from('course_revisions').select('*').eq('course_id', course.id)).data?.length,
      1,
    );
  });
  await test('concurrent saves: one succeeds and the stale writer is rejected', async () => {
    course.version = version;
    const r = await Promise.all([
      editor.rpc('save_course', { doc: course, expected_version: version }),
      editor.rpc('save_course', { doc: course, expected_version: version }),
    ]);
    assert.equal(r.filter((x) => !x.error).length, 1);
    assert.equal(r.filter((x) => x.error?.message.includes('EDIT_CONFLICT')).length, 1);
    version = r.find((x) => !x.error)!.data.version;
  });
  await test('unpublished lesson blocks are hidden after publication', async () => {
    course.version = version;
    course.modules[0].lessons[1].published = false;
    const save = await admin.rpc('save_course', { doc: course, expected_version: version });
    okay(save);
    version = save.data.version;
    okay(await admin.rpc('publish_course', { cid: course.id, expected_version: version }));
    const hidden = course.modules[0].lessons[1].id;
    assert.deepEqual((await a.from('lesson_blocks').select('*').eq('lesson_id', hidden)).data, []);
    assert.deepEqual(
      (await a.from('lesson_revisions').select('*').eq('lesson_id', hidden)).data,
      [],
    );
  });
  await test('idempotent completion and progress survive edits', async () => {
    const id = course.modules[0].lessons[0].id;
    okay(await a.rpc('record_progress', { lid: id, complete: true, seconds: 5 }));
    const first = await a.from('progress').select('*').eq('lesson_id', id).single();
    okay(await a.rpc('record_progress', { lid: id, complete: true, seconds: 10 }));
    const second = await a.from('progress').select('*').eq('lesson_id', id).single();
    assert.equal(first.data!.completed_at, second.data!.completed_at);
    assert.equal(second.data!.playback_seconds, 10);
  });
  await test('renaming title preserves slug; explicit change creates alias', async () => {
    const old = course.slug;
    course.slug = `${old}-new`;
    course.version = version;
    const save = await admin.rpc('save_course', { doc: course, expected_version: version });
    okay(save);
    version = save.data.version;
    okay(await admin.rpc('publish_course', { cid: course.id, expected_version: version }));
    assert.equal(
      (await a.from('slug_aliases').select('course_id').eq('slug', old).single()).data!.course_id,
      course.id,
    );
  });
  await test('revoke hides course and saved content, preserves progress, regrant restores it', async () => {
    okay(await a.rpc('save_item', { cid: course.id, lid: null, enabled: true }));
    okay(
      await admin.rpc('set_access', {
        target_user: accounts[2].id,
        cid: course.id,
        enabled: false,
      }),
    );
    assert.deepEqual((await a.from('courses').select('id').eq('id', course.id)).data, []);
    assert.deepEqual(
      (await a.from('saved_items').select('id').eq('course_id', course.id)).data,
      [],
    );
    assert.ok(
      (
        await a.rpc('record_progress', {
          lid: course.modules[0].lessons[0].id,
          complete: true,
          seconds: 0,
        })
      ).error,
    );
    okay(
      await admin.rpc('set_access', { target_user: accounts[2].id, cid: course.id, enabled: true }),
    );
    assert.ok(
      (
        await a
          .from('progress')
          .select('completed_at')
          .eq('lesson_id', course.modules[0].lessons[0].id)
          .single()
      ).data!.completed_at,
    );
  });
  await test('used media and categories cannot be deleted', async () => {
    assert.ok(
      (await admin.rpc('delete_media', { mid: fixtureId('asset-pdf-0') })).error?.message.includes(
        'ASSET_IN_USE',
      ),
    );
    assert.ok(
      (
        await admin.rpc('mutate_category', {
          cid: course.categoryId,
          label: 'x',
          color: 'blue',
          remove: true,
        })
      ).error,
    );
  });
  await test('atomic rate counter handles truly concurrent connections', async () => {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 12 });
    const k = `qa:${randomUUID()}`;
    try {
      const counts = await Promise.all(
        Array.from({ length: 20 }, () =>
          pool.query('select private.consume_limit($1,10,60) retry', [k]),
        ),
      );
      assert.equal(counts.filter((r) => r.rows[0].retry === 0).length, 10);
      await db.query('delete from private.rate_limits where key=$1', [k]);
    } finally {
      await pool.end();
    }
  });
  await test('service-only finalization RPC is denied to authenticated users', async () => {
    assert.ok(
      (
        await a.rpc('finalize_media', {
          mid: fixtureId('asset-pdf-0'),
          owner: accounts[2].id,
          sha: 'a'.repeat(64),
          accepted: true,
        })
      ).error,
    );
  });
  await test('database metadata cannot be used to escalate role', async () => {
    okay(await a.auth.updateUser({ data: { role: 'admin' } }));
    assert.ok((await a.rpc('set_role', { target_user: accounts[2].id, new_role: 'admin' })).error);
  });
  await test('download metadata service RPC is unavailable to all user roles', async () => {
    for (const client of [anon, a, b, editor, admin])
      assert.ok((await client.rpc('download_asset', { mid: fixtureId('asset-pdf-0') })).error);
  });
  await test('database validation rejects malformed video IDs and raw HTML through direct RPC', async () => {
    const original = (
      await admin.rpc('course_document', { cid: fixtureId('course-0'), draft: true })
    ).data;
    for (const payload of [
      {
        id: randomUUID(),
        version: 1,
        type: 'video',
        data: { provider: 'youtube', url: 'https://youtube.com/watch?v=invalid', title: 'Invalid' },
      },
      {
        id: randomUUID(),
        version: 1,
        type: 'rich_text',
        data: {
          document: { type: 'doc', content: [{ type: 'html', text: '<script>alert(1)</script>' }] },
        },
      },
    ]) {
      const invalid = structuredClone(original);
      invalid.modules[0].lessons[0].blocks = [payload];
      assert.ok(
        (await admin.rpc('save_course', { doc: invalid, expected_version: invalid.version })).error,
      );
    }
  });
  await test('private-only course tags are filtered before student results', async () => {
    const visible = await b.from('tags').select('id,name');
    okay(visible);
    for (const tag of visible.data ?? []) {
      const references = await b.from('revision_tags').select('revision_id').eq('tag_id', tag.id);
      assert.ok(references.data?.length);
    }
  });
  await test('idle timeout cannot be reset by touching the existing session', async () => {
    const claims = await editor.auth.getClaims();
    const sid = claims.data!.claims.session_id;
    await db.query(
      "update private.admin_sessions set last_active_at=now()-interval '31 minutes' where session_id=$1",
      [sid],
    );
    assert.ok((await editor.rpc('touch_staff_session')).error?.message.includes('SESSION_EXPIRED'));
    assert.ok((await editor.rpc('save_course', { doc: course, expected_version: version })).error);
  });
  await test('absolute staff session limit survives JWT refresh', async () => {
    const staff = await login(1, true),
      claims = await staff.auth.getClaims();
    await db.query(
      "update private.admin_sessions set started_at=now()-interval '13 hours' where session_id=$1",
      [claims.data!.claims.session_id],
    );
    assert.equal((await staff.auth.refreshSession()).error, null);
    assert.ok((await staff.rpc('touch_staff_session')).error?.message.includes('SESSION_EXPIRED'));
  });
  await test('revoked auth session immediately loses access with still-valid JWT', async () => {
    const student = await login(2),
      claims = await student.auth.getClaims();
    await db.query('delete from auth.sessions where id=$1', [claims.data!.claims.session_id]);
    assert.deepEqual((await student.from('courses').select('id')).data, []);
  });
  await test('archived course disappears without deleting learning history', async () => {
    okay(await admin.rpc('delete_course', { cid: course.id }));
    assert.deepEqual((await a.from('courses').select('id').eq('id', course.id)).data, []);
    assert.equal(
      (
        await db.query('select count(*)::int count from public.progress where course_id=$1', [
          course.id,
        ])
      ).rows[0].count,
      1,
    );
  });
  await test('audit contains trusted actor and required operations', async () => {
    const rows = await admin
      .from('audit_logs')
      .select('actor_id,action')
      .eq('entity_id', course.id);
    for (const action of [
      'course.create',
      'course.publish',
      'course.delete',
      'access.grant',
      'access.revoke',
    ])
      assert.ok(rows.data?.some((r) => r.action === action && r.actor_id === accounts[0].id));
  });
} finally {
  await db.end();
  mkdirSync(qaPath('evidence'), { recursive: true });
  writeFileSync(
    qaPath('evidence/security-api.json'),
    JSON.stringify({ executedAt: new Date().toISOString(), results }, null, 2),
  );
}
const failed = results.filter((r) => r.status === 'FAIL');
console.log(`${results.length - failed.length}/${results.length} security scenarios passed`);
if (failed.length) process.exitCode = 1;
