import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { TOTP, Secret } from 'otpauth';
import { qaPath } from './qa-paths.mjs';
import { demoCourses } from './fixtures';
import { binaries, execute, processVideo } from '../workers/video.mjs';
if (
  process.env.SUPABASE_URL !== 'http://127.0.0.1:56321' ||
  new URL(process.env.DATABASE_URL!).port !== '56322'
)
  throw new Error('Local-only feature QA');
const sql = new pg.Client({ connectionString: process.env.DATABASE_URL });
await sql.connect();
const accounts = JSON.parse(readFileSync('.local/seed-accounts.json', 'utf8'));
const client = (key: string) =>
  createClient(process.env.SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
const service = client(process.env.SUPABASE_SECRET_KEY!),
  anon = client(process.env.SUPABASE_PUBLISHABLE_KEY!);
async function actor(index: number, mfa = true) {
  const db = client(process.env.SUPABASE_PUBLISHABLE_KEY!),
    a = accounts[index];
  assert.equal(
    (await db.auth.signInWithPassword({ email: a.email, password: a.password })).error,
    null,
  );
  if (index < 2 && mfa) {
    assert.equal(
      (
        await db.auth.mfa.challengeAndVerify({
          factorId: a.factorId,
          code: new TOTP({ secret: Secret.fromBase32(a.totpSecret) }).generate(),
        })
      ).error,
      null,
    );
    assert.equal((await db.rpc('touch_staff_session')).error, null);
  }
  return db;
}
const checks: { name: string; status: string }[] = [];
async function check(name: string, fn: () => Promise<void>) {
  await fn();
  checks.push({ name, status: 'PASS' });
  console.log('PASS ' + name);
}
const admin = await actor(0),
  editor = await actor(1),
  student = await actor(2),
  staffAal1 = await actor(0, false);
const cid = randomUUID(),
  jobs: string[] = [],
  rules: string[] = [],
  media: string[] = [];
let connection: string | null = null;
const op = async (
  db: ReturnType<typeof client>,
  name: string,
  payload: Record<string, unknown> = {},
) => {
  const r = await db.rpc('operations', { op: name, payload });
  if (r.error) throw new Error(r.error.message);
  return r.data;
};
const worker = async (name: string, payload: Record<string, unknown> = {}) => {
  const r = await service.rpc('worker_api', { op: name, payload });
  if (r.error) throw new Error(r.error.message);
  return r.data;
};
try {
  await sql.query('delete from private.rate_limits');
  await check('RBAC: anonymous/student/editor/AAL1 cannot read operational data', async () => {
    for (const db of [anon, student, editor, staffAal1])
      assert.ok((await db.rpc('operations', { op: 'list' })).error);
    for (const db of [anon, student, editor, admin])
      assert.ok((await db.rpc('worker_api', { op: 'claim' })).error);
  });
  const seed = demoCourses()[0];
  const doc = {
    ...seed,
    id: cid,
    version: 0,
    slug: 'qa-ops-' + cid,
    title: 'QA — Операционные сценарии',
    accessMode: 'restricted',
    tags: [],
    modules: seed.modules.map((m) => ({
      ...m,
      id: randomUUID(),
      lessons: m.lessons.map((l) => ({
        ...l,
        id: randomUUID(),
        blocks: l.blocks.map((b) => ({ ...b, id: randomUUID() })),
      })),
    })),
  };
  const saved = await admin.rpc('save_course', { doc, expected_version: 0 });
  assert.equal(saved.error, null);
  const version = saved.data.version;
  assert.equal((await admin.rpc('publish_course', { cid, expected_version: version })).error, null);
  await check(
    'Bulk access: concurrent replay creates one enrollment/grant/audit per learner',
    async () => {
      const payload = {
        requestId: randomUUID(),
        courseId: cid,
        userIds: [accounts[2].id, accounts[3].id],
        enabled: true,
      };
      await Promise.all([op(admin, 'bulk', payload), op(admin, 'bulk', payload)]);
      assert.equal(
        (
          await sql.query('select count(*)::int n from public.enrollments where course_id=$1', [
            cid,
          ])
        ).rows[0].n,
        2,
      );
      assert.equal(
        (
          await sql.query(
            "select count(*)::int n from public.audit_logs where action='access.grant' and entity_id=$1",
            [cid],
          )
        ).rows[0].n,
        2,
      );
    },
  );
  await check('Bulk access: invalid target rolls back the entire transaction', async () => {
    await assert.rejects(
      op(admin, 'bulk', {
        requestId: randomUUID(),
        courseId: cid,
        userIds: [accounts[4].id, accounts[1].id],
        enabled: true,
      }),
    );
    assert.equal(
      (
        await sql.query(
          'select count(*)::int n from public.enrollments where course_id=$1 and user_id=$2',
          [cid, accounts[4].id],
        )
      ).rows[0].n,
      0,
    );
  });
  await check('Student detail uses published progress and last lesson', async () => {
    const lesson = doc.modules[0].lessons[0];
    assert.equal(
      (await student.rpc('record_progress', { lid: lesson.id, complete: true, seconds: 12 })).error,
      null,
    );
    const card = await op(admin, 'student', { id: accounts[2].id });
    const course = card.courses.find((c: { id: string }) => c.id === cid);
    assert.equal(course.completed, 1);
    assert.equal(course.last_lesson.id, lesson.id);
    assert.ok(card.history.some((a: { action: string }) => a.action === 'access.grant'));
  });
  await check('Import preview rejects duplicates and staff accounts', async () => {
    const preview = await op(admin, 'import.preview', {
      filename: 'qa.csv',
      rows: [
        { email: 'test@example.com', first_name: 'Анна' },
        { email: 'TEST@example.com', first_name: 'Иван' },
        { email: accounts[0].email, first_name: 'Админ' },
      ],
    });
    jobs.push(preview.id);
    assert.equal(preview.rows[1].issues.length, 1);
    assert.equal(preview.rows[2].issues.length, 1);
    await assert.rejects(op(admin, 'import.confirm', { id: preview.id }));
  });
  await check('Queue lease and import row replay preserve assignments', async () => {
    const preview = await op(admin, 'import.preview', {
      filename: 'qa.csv',
      rows: [{ email: accounts[4].email, first_name: 'Ученик' }],
    });
    jobs.push(preview.id);
    await op(admin, 'import.confirm', { id: preview.id, courseId: cid });
    await sql.query("update private.operations_jobs set created_at='2000-01-01' where id=$1", [
      preview.id,
    ]);
    const [a, b] = await Promise.all([worker('claim'), worker('claim')]);
    const j = [a, b].find((v) => v?.id === preview.id);
    assert.ok(j);
    assert.equal([a, b].filter((v) => v?.id === preview.id).length, 1);
    await assert.rejects(worker('progress', { job_id: j.id, lease: randomUUID(), progress: 20 }));
    const binding = { job_id: j.id, lease: j.lease };
    assert.equal((await worker('lookup', { ...binding, row: 0 })).id, accounts[4].id);
    await worker('import.row', { ...binding, row: 0, user_id: accounts[4].id, created: false });
    await worker('import.row', { ...binding, row: 0, user_id: accounts[4].id, created: false });
    await worker('finish', { ...binding, success: true });
    assert.equal(
      (
        await sql.query(
          'select count(*)::int n from public.enrollments where course_id=$1 and user_id=$2',
          [cid, accounts[4].id],
        )
      ).rows[0].n,
      1,
    );
  });
  await check('Schedule: daily/weekly timezones and DST advance', async () => {
    for (const [freq, tz, time] of [
      ['daily', 'Europe/Moscow', '2026-09-30T08:00Z'],
      ['weekly', 'Europe/Moscow', '2026-09-30T08:00Z'],
      ['daily', 'America/New_York', '2026-03-08T06:00Z'],
    ]) {
      const r = await sql.query('select private.next_automation_time($1,2,30,1,$2,$3) t', [
        freq,
        tz,
        time,
      ]);
      assert.ok(new Date(r.rows[0].t) > new Date(time));
    }
    await assert.rejects(
      sql.query("select private.next_automation_time('daily',25,0,1,'Invalid/Timezone',now())"),
    );
  });
  await check(
    'Telegram binding: one use token, private identity, update deduplication',
    async () => {
      assert.equal(
        (
          await sql.query(
            'select count(*)::int n from private.telegram_connections where owner_id=$1',
            [accounts[0].id],
          )
        ).rows[0].n,
        0,
        'Do not overwrite a real bot connection',
      );
      const link = await op(admin, 'telegram.link');
      const updateId = 900000000 + Math.floor(Math.random() * 1000000);
      const update = {
        update_id: updateId,
        chat_id: 999999999,
        telegram_id: 999999999,
        chat_type: 'private',
        command: 'link',
        token: link.token,
      };
      const connected = await worker('telegram', update);
      jobs.push(connected.id);
      assert.ok((await worker('telegram', update)).duplicate);
      assert.ok((await worker('telegram', { ...update, update_id: updateId + 1 })).ignored);
      connection = (
        await sql.query('select id from private.telegram_connections where owner_id=$1', [
          accounts[0].id,
        ])
      ).rows[0].id;
      const id = randomUUID();
      rules.push(id);
      await op(admin, 'rule.save', {
        id,
        name: 'QA — Ежедневный отчёт',
        kind: 'summary',
        enabled: true,
        frequency: 'daily',
        hour: 9,
        minute: 0,
        weekday: 1,
        timezone: 'Europe/Moscow',
        recipients: [connection],
      });
      await sql.query(
        "update private.automation_rules set next_run_at=now()-interval '1 minute' where id=$1",
        [id],
      );
      await worker('schedule');
      await worker('schedule');
      const scheduled = await sql.query(
        "select id from private.operations_jobs where payload->>'name'='QA — Ежедневный отчёт'",
      );
      jobs.push(...scheduled.rows.map((r) => r.id));
      assert.equal(scheduled.rowCount, 1);
      await sql.query("update private.operations_jobs set created_at='2000-01-01' where id=$1", [
        connected.id,
      ]);
      const reportJob = await worker('claim'),
        binding = { job_id: reportJob.id, lease: reportJob.lease };
      assert.equal(reportJob.id, connected.id);
      assert.equal(
        (await worker('report.recipient', { ...binding, recipient: connection })).id,
        connection,
      );
      await worker('report.receipt', { ...binding, recipient: connection });
      await worker('report.receipt', { ...binding, recipient: connection });
      const receipts = (
        await sql.query('select result from private.operations_jobs where id=$1', [reportJob.id])
      ).rows[0].result.delivered;
      assert.equal(receipts.length, 1);
      await sql.query('update private.telegram_connections set enabled=false where id=$1', [
        connection,
      ]);
      await assert.rejects(worker('report.recipient', { ...binding, recipient: connection }));
      await sql.query(
        "update private.operations_jobs set status='cancelled' where id=any($1::uuid[])",
        [jobs],
      );
    },
  );
  await check(
    'Actual FFmpeg burn-in and poster derivatives (Cyrillic, filter characters)',
    async () => {
      mkdirSync('.local/video-qa', { recursive: true });
      const b = binaries(process.env);
      await execute(b.ffmpeg, [
        '-nostdin',
        '-y',
        '-f',
        'lavfi',
        '-i',
        'color=c=0x666666:s=640x360:d=3',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-threads',
        '2',
        '.local/operations-fixture.mp4',
      ]);
      const output = await processVideo(
        resolve('.local/operations-fixture.mp4'),
        resolve('.local/video-qa'),
        "Академия: 100% 'текст'",
        process.env,
      );
      assert.ok(output.size > 1000);
      assert.equal(output.duration, 3);
      const sharp = (await import('sharp')).default;
      const region = await sharp(
        await sharp(output.variants.large)
          .extract({ left: 350, top: 230, width: 250, height: 80 })
          .toBuffer(),
      ).stats();
      assert.ok(
        region.channels.some((c) => c.max - c.min > 120),
        'Burned text must change actual frame pixels',
      );
      assert.ok(output.variants.small.length > 0);
    },
  );
  await check('Long Cyrillic watermark fits a narrow frame without edge clipping', async () => {
    const dir = resolve('.local/video-qa-long');
    mkdirSync(dir, { recursive: true });
    const input = resolve('.local/operations-narrow.mp4');
    await execute(binaries(process.env).ffmpeg, [
      '-nostdin',
      '-y',
      '-f',
      'lavfi',
      '-i',
      'color=c=0x666666:s=240x320:d=1',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-threads',
      '2',
      input,
    ]);
    const title = 'Широкое название образовательной академии с кириллицей и длиннымсловом'
      .repeat(2)
      .slice(0, 120);
    const output = await processVideo(input, dir, title, process.env);
    const sharp = (await import('sharp')).default;
    const stats = await sharp(output.variants.large).stats();
    assert.ok(
      stats.channels.some((c) => c.max - c.min > 120),
      'Long title must be burned into actual pixels',
    );
    for (const region of [
      { left: 0, top: 0, width: 4, height: 320 },
      { left: 236, top: 0, width: 4, height: 320 },
      { left: 0, top: 0, width: 240, height: 4 },
      { left: 0, top: 316, width: 240, height: 4 },
    ]) {
      const edge = await sharp(
        await sharp(output.variants.large).extract(region).toBuffer(),
      ).stats();
      assert.ok(
        edge.channels.every((c) => c.max - c.min < 25),
        'Watermark must not touch frame edges',
      );
    }
    const lines = readFileSync(resolve(dir, 'title.txt'), 'utf8').split('\n');
    assert.ok(lines.length > 1);
    assert.equal(lines.join('').replaceAll(' ', ''), title.replaceAll(' ', ''));
  });
  await check('Source bucket and pending video stay inaccessible to Student', async () => {
    const id = randomUUID();
    media.push(id);
    const j = await op(editor, 'video.create', {
      id,
      filename: 'QA видео.mp4',
      size: 1024,
      watermark: 'Академия',
      download: false,
    });
    jobs.push(j.id);
    assert.equal((await student.from('media').select('id').eq('id', id)).data?.length, 0);
    assert.ok(
      (await student.storage.from('academy-video-source').createSignedUrl(j.original_key, 60))
        .error,
    );
    assert.ok(
      (await anon.storage.from('academy-private').createSignedUrl(j.original_key, 60)).error,
    );
  });
  writeFileSync(
    qaPath('evidence/academy-operations.json'),
    JSON.stringify(
      {
        status: 'PASS',
        checks,
        telegramLive: 'UNVERIFIED — real token not configured',
        scope: 'Local Supabase, real MFA, SQL constraints, FFmpeg binary; no payment scope',
      },
      null,
      2,
    ),
  );
} finally {
  if (connection)
    await sql.query('delete from private.telegram_connections where id=$1', [connection]);
  if (rules.length)
    await sql.query('delete from private.automation_rules where id=any($1::uuid[])', [rules]);
  await sql.query('delete from private.telegram_links where owner_id=$1', [accounts[0].id]);
  if (jobs.length)
    await sql.query('delete from private.operations_jobs where id=any($1::uuid[])', [jobs]);
  if (media.length) await sql.query('delete from public.media where id=any($1::uuid[])', [media]);
  await sql.query('update public.courses set deleted_at=now() where id=$1', [cid]);
  await sql.end();
}
