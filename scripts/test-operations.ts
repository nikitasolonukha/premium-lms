import { qaPath } from './qa-paths.mjs';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { chromium, expect } from '@playwright/test';
import { TOTP, Secret } from 'otpauth';
if (
  process.env.SUPABASE_URL !== 'http://127.0.0.1:56321' ||
  new URL(process.env.DATABASE_URL!).port !== '56322'
)
  throw new Error('Operator QA requires an empty local Supabase');
const sql = new pg.Client({ connectionString: process.env.DATABASE_URL });
await sql.connect();
const service = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const run = (file: string, args: string[] = []) =>
  execFileSync(process.execPath, ['--import', 'tsx', '--env-file=.env.local', file, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
const browser = await chromium.launch(),
  page = await browser.newPage();
try {
  assert.equal(
    (await sql.query("select count(*)::int n from public.user_roles where role='admin'")).rows[0].n,
    0,
    'Run before demo seed on the empty local database',
  );
  const email = `bootstrap-${Date.now()}@academy.local`,
    password = `Aa1!${randomBytes(20).toString('hex')}`;
  assert.match(run('scripts/admin.ts', ['create', email]), /First Admin invited/);
  const id = (await sql.query('select id from auth.users where email=$1', [email])).rows[0].id;
  assert.equal(
    (await sql.query('select role from public.user_roles where user_id=$1', [id])).rows[0].role,
    'admin',
  );
  let mailId = '';
  await expect
    .poll(async () => {
      const inbox = await (await fetch('http://127.0.0.1:56324/api/v1/messages')).json();
      mailId =
        inbox.messages.find((m: { ID: string; To: { Address: string }[] }) =>
          m.To.some((t) => t.Address === email),
        )?.ID ?? '';
      return !!mailId;
    })
    .toBe(true);
  const mail = await (await fetch(`http://127.0.0.1:56324/api/v1/message/${mailId}`)).json();
  const href = String(mail.HTML)
    .match(/href="([^"]*\/auth\/callback[^"]*)"/)?.[1]
    ?.replaceAll('&amp;', '&');
  assert.ok(href);
  await page.goto(href);
  await expect(page).toHaveURL(/\/reset-password$/);
  await page.getByLabel('Новый пароль', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Сохранить пароль' }).click();
  await expect(page.getByRole('heading', { name: 'Готово' })).toBeVisible();
  await page.goto('http://localhost:3000/admin');
  await expect(page).toHaveURL(/\/mfa$/);
  await page.getByRole('button', { name: 'Подключить аутентификатор' }).click();
  const secret = (await page.locator('.mfa-secret').innerText()).trim();
  await page
    .getByLabel('Код из приложения')
    .fill(new TOTP({ secret: Secret.fromBase32(secret) }).generate());
  await page.getByRole('button', { name: 'Подтвердить вход' }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.locator('.admin-main')).toBeVisible();
  await page.goto('http://localhost:3000/admin/analytics');
  await expect(page.locator('.empty-state')).toHaveCount(2);
  await expect(page.locator('.empty-state').first()).toBeVisible();
  const attempts = [];
  for (const status of ['pending', 'rejected', 'ready']) {
    const mid = randomUUID(),
      key = `${id}/${mid}`;
    attempts.push({ mid, key, status });
    assert.equal(
      (
        await service.storage
          .from('academy-private')
          .upload(key, Buffer.from('operator fixture'), { contentType: 'application/pdf' })
      ).error,
      null,
    );
    await sql.query(
      "insert into public.media(id,owner_id,object_key,filename,mime_type,size_bytes,status,created_at) values($1,$2,$3,'fixture.pdf','application/pdf',16,$4,now()-interval '25 hours')",
      [mid, id, key, status],
    );
  }
  assert.match(run('scripts/cleanup-media.ts'), /cleaned 2/);
  assert.match(run('scripts/cleanup-media.ts'), /cleaned 0/);
  for (const item of attempts) {
    assert.equal(
      (await sql.query('select status from public.media where id=$1', [item.mid])).rows[0].status,
      item.status === 'ready' ? 'ready' : 'deleted',
    );
    const object = await service.storage.from('academy-private').download(item.key);
    assert.equal(!object.error, item.status === 'ready');
  }
  assert.throws(() => run('scripts/admin.ts', ['create', `second-${email}`]), /already exists/);
  assert.throws(() => run('scripts/admin.ts', ['recover-mfa', email]), /confirm/);
  assert.match(
    run('scripts/admin.ts', ['recover-mfa', email, `--confirm=${email}`]),
    /all sessions revoked/,
  );
  assert.equal(
    (await sql.query('select count(*)::int n from auth.sessions where user_id=$1', [id])).rows[0].n,
    0,
  );
  assert.equal((await service.auth.admin.mfa.listFactors({ userId: id })).data?.factors.length, 0);
  await page.goto('http://localhost:3000/admin');
  await expect(page).toHaveURL(/\/login/);
  assert.equal(
    (
      await sql.query(
        "select count(*)::int n from public.audit_logs where action in ('operator.bootstrap','operator.mfa_recovery')",
      )
    ).rows[0].n,
    2,
  );
  writeFileSync(
    qaPath('evidence/operations.json'),
    JSON.stringify(
      {
        executedAt: new Date().toISOString(),
        status: 'PASS',
        checks: [
          'first Admin CLI on empty database',
          'real local SMTP invitation and password UI',
          'staff cannot enter Admin before TOTP',
          'TOTP enrollment and Admin access',
          'empty analytics',
          'bootstrap cannot create second Admin',
          'cleanup removes old pending/rejected and preserves ready',
          'cleanup is repeatable',
          'MFA recovery requires explicit matching email',
          'MFA recovery removes factors, revokes all sessions and denies old browser cookies',
          'operator actions audited',
        ],
      },
      null,
      2,
    ),
  );
  console.log('PASS: 11 operator/bootstrap/cleanup scenarios');
} finally {
  await browser.close();
  await sql.end();
}
