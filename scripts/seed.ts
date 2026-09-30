import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import { randomBytes, createHash } from 'node:crypto';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { TOTP, Secret } from 'otpauth';
import { fixtureId, demoAssets, demoCourses } from './fixtures';
import { defaultSettings } from '../src/lib/schemas';
import { prepareImageVariants, imageVariantKey } from '../src/lib/image-variants';
const url = process.env.SUPABASE_URL!;
if (!/^http:\/\/(127\.0\.0\.1|localhost):56321$/.test(url))
  throw new Error('Seed is restricted to isolated local Supabase');
const admin = createClient(url, process.env.SUPABASE_SECRET_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
mkdirSync('.local', { recursive: true });
type Account = {
  id: string;
  email: string;
  password: string;
  role: string;
  firstName: string;
  lastName: string;
  totpSecret?: string;
  factorId?: string;
};
const accounts: Account[] = existsSync('.local/seed-accounts.json')
  ? JSON.parse(readFileSync('.local/seed-accounts.json', 'utf8'))
  : [
      ['admin', 'Никита', 'Волков'],
      ['editor', 'Елена', 'Соколова'],
      ['student-a', 'Александр', 'Миронов'],
      ['student-b', 'Дарья', 'Орлова'],
      ['student-c', 'Илья', 'Ким'],
    ].map(([key, firstName, lastName]) => ({
      id: fixtureId(`user-${key}`),
      email: `${key}@academy.local`,
      password: `Aa1!${randomBytes(18).toString('base64url')}`,
      role: key.startsWith('student') ? 'student' : key,
      firstName,
      lastName,
    }));
const persist = () =>
  writeFileSync('.local/seed-accounts.json', JSON.stringify(accounts, null, 2), { mode: 0o600 });
persist();
function check(error: unknown) {
  if (error) throw error;
}
try {
  for (const account of accounts) {
    const existing = await admin.auth.admin.getUserById(account.id);
    if (!existing.data.user) {
      const result = await admin.auth.admin.createUser({
        id: account.id,
        email: account.email,
        password: account.password,
        email_confirm: true,
        user_metadata: { first_name: account.firstName, last_name: account.lastName },
      });
      check(result.error);
      account.factorId = undefined;
      account.totpSecret = undefined;
    }
    await db.query('update public.user_roles set role=$1 where user_id=$2', [
      account.role,
      account.id,
    ]);
  }
  const owner = accounts[0],
    client = createClient(url, process.env.SUPABASE_PUBLISHABLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  check(
    (await client.auth.signInWithPassword({ email: owner.email, password: owner.password })).error,
  );
  for (const account of accounts.filter((a) => a.role !== 'student')) {
    const staff =
      account === owner
        ? client
        : createClient(url, process.env.SUPABASE_PUBLISHABLE_KEY!, {
            auth: { autoRefreshToken: false, persistSession: false },
          });
    if (account !== owner)
      check(
        (await staff.auth.signInWithPassword({ email: account.email, password: account.password }))
          .error,
      );
    const factors = await staff.auth.mfa.listFactors();
    check(factors.error);
    if (!account.factorId || !factors.data?.totp.some((f) => f.id === account.factorId)) {
      for (const f of factors.data?.all ?? [])
        if (f.status === 'unverified') await staff.auth.mfa.unenroll({ factorId: f.id });
      const enrolled = await staff.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'Local QA',
        issuer: 'Academy LMS',
      });
      check(enrolled.error);
      account.factorId = enrolled.data!.id;
      account.totpSecret = enrolled.data!.totp.secret;
      persist();
    }
    const code = new TOTP({ secret: Secret.fromBase32(account.totpSecret!) }).generate();
    check((await staff.auth.mfa.challengeAndVerify({ factorId: account.factorId!, code })).error);
    check((await staff.rpc('touch_staff_session')).error);
  }
  for (const [i, name] of ['Искусственный интеллект', 'Продукт и стратегия', 'Дизайн'].entries())
    check(
      (
        await client.rpc('mutate_category', {
          cid: fixtureId(`category-${i}`),
          label: name,
          color: ['blue', 'lime', 'lilac'][i],
          remove: false,
        })
      ).error,
    );
  for (const asset of await demoAssets()) {
    const id = fixtureId(`asset-${asset.name}`),
      key = `${owner.id}/${id}`;
    check(
      (
        await admin.storage
          .from('academy-private')
          .upload(key, asset.bytes, { contentType: asset.mime, upsert: true })
      ).error,
    );
    if (asset.mime.startsWith('image/')) {
      for (const variant of await prepareImageVariants(asset.bytes))
        check(
          (
            await admin.storage
              .from('academy-private')
              .upload(imageVariantKey(key, variant.size, 1), variant.bytes, {
                contentType: 'image/webp',
                upsert: true,
              })
          ).error,
        );
    }
    await db.query(
      "insert into public.media(id,owner_id,object_key,filename,mime_type,size_bytes,status,purpose,sha256,variant_version) values($1,$2,$3,$4,$5,$6,'ready','course',$7,$8) on conflict(id) do update set status='ready',size_bytes=excluded.size_bytes,sha256=excluded.sha256,variant_version=excluded.variant_version",
      [
        id,
        owner.id,
        key,
        asset.filename,
        asset.mime,
        asset.bytes.length,
        createHash('sha256').update(asset.bytes).digest('hex'),
        asset.mime.startsWith('image/') ? 1 : 0,
      ],
    );
  }
  for (const course of demoCourses()) {
    const current = await db.query(
      'select r.version from public.courses c join public.course_revisions r on r.id=coalesce(c.draft_revision_id,c.published_revision_id) where c.id=$1',
      [course.id],
    );
    course.version = current.rows[0]?.version ?? 0;
    const saved = await client.rpc('save_course', {
      doc: course,
      expected_version: course.version,
    });
    check(saved.error);
    if (saved.data?.error) throw new Error(saved.data.error);
    const published = await client.rpc('publish_course', {
      cid: course.id,
      expected_version: saved.data.version,
    });
    check(published.error);
  }
  for (const user of [accounts[2], accounts[4]])
    for (const ci of [0, 1])
      check(
        (
          await client.rpc('set_access', {
            target_user: user.id,
            cid: fixtureId(`course-${ci}`),
            enabled: true,
          })
        ).error,
      );
  const student = createClient(url, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  check(
    (
      await student.auth.signInWithPassword({
        email: accounts[2].email,
        password: accounts[2].password,
      })
    ).error,
  );
  check(
    (
      await student.rpc('record_progress', {
        lid: fixtureId('lesson-0-0'),
        complete: true,
        seconds: 60,
      })
    ).error,
  );
  check(
    (
      await student.rpc('record_progress', {
        lid: fixtureId('lesson-0-1'),
        complete: false,
        seconds: 0,
      })
    ).error,
  );
  check(
    (await student.rpc('save_item', { cid: fixtureId('course-0'), lid: null, enabled: true }))
      .error,
  );
  check(
    (
      await client.rpc('update_settings', {
        doc: { ...defaultSettings, support_email: 'support@academy.local' },
      })
    ).error,
  );
  persist();
  console.log(
    'Seed complete: 5 accounts, 3 courses, 6 modules, 12 lessons, 11 block types, 15 private assets.',
  );
  console.log('Local-only account credentials: .local/seed-accounts.json (gitignored).');
} finally {
  await db.end();
}
