import { test, expect, type Page } from './test';
import { createClient } from '@supabase/supabase-js';
import { randomBytes, randomUUID } from 'node:crypto';
import { TOTP, Secret } from 'otpauth';
import pg from 'pg';
import { writeFileSync } from 'node:fs';
import { accounts, login } from './helpers';
import { staffClient } from './db-fixtures';
import { fixtureId, demoCourses } from '../../scripts/fixtures';
import { qaPath } from '../../scripts/qa-paths.mjs';

async function credentials(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Войти в академию' }).click();
}

test('Student promoted to Admin must set up TOTP at next login; AAL1 cannot call Admin RPC', async ({
  browser,
}) => {
  const db = await staffClient();
  const service = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const email = `promotion-${randomUUID()}@academy.local`,
    password = 'Aa1!' + randomBytes(24).toString('hex');
  const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
  expect(created.error).toBeNull();
  const id = created.data.user!.id,
    context = await browser.newContext(),
    page = await context.newPage();
  try {
    await credentials(page, email, password);
    await expect(page).toHaveURL(/\/dashboard$/);
    expect((await db.rpc('set_role', { target_user: id, new_role: 'admin' })).error).toBeNull();
    await page.goto('/profile');
    await page.getByRole('button', { name: 'Выйти из аккаунта' }).click();
    await credentials(page, email, password);
    await expect(page).toHaveURL(/\/mfa/);
    await expect(page.getByRole('button', { name: 'Подключить аутентификатор' })).toBeVisible();
    const aal1 = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    expect((await aal1.auth.signInWithPassword({ email, password })).error).toBeNull();
    const original = (await db.from('settings').select('config').single()).data!.config;
    expect((await aal1.rpc('update_settings', { doc: original })).error).not.toBeNull();
    expect(
      (await aal1.rpc('publish_course', { cid: fixtureId('course-0'), expected_version: 0 })).error,
    ).not.toBeNull();
    await page.getByRole('button', { name: 'Подключить аутентификатор' }).click();
    const secret = (await page.locator('.mfa-secret').innerText()).trim();
    await page
      .getByLabel('Код из приложения')
      .fill(new TOTP({ secret: Secret.fromBase32(secret) }).generate());
    await page.getByRole('button', { name: 'Подтвердить вход' }).click();
    await expect(page).toHaveURL(/\/admin$/);
  } finally {
    await context.close();
    // Audit actor references are intentionally retained; use ordinary logical disable.
    expect(
      (await db.rpc('set_user_disabled', { target_user: id, disabled: true })).data,
    ).toMatchObject({ ok: true });
    expect((await db.rpc('set_role', { target_user: id, new_role: 'student' })).data).toMatchObject(
      { ok: true },
    );
  }
  writeFileSync(
    qaPath('evidence/mfa-promotion.json'),
    JSON.stringify(
      {
        status: 'PASS',
        checks: [
          'fresh Student login',
          'role changed through guarded Admin RPC',
          'next login requires new MFA setup',
          'AAL1 settings and publication denied',
          'new verified TOTP permits Admin UI',
          'fixture disabled/demoted through guarded RPC, audit retained',
        ],
        scope:
          'Real local Auth/browser/RLS; MFA recovery and last-admin protection are separate existing security tests.',
      },
      null,
      2,
    ),
  );
});

for (const mode of ['revoked-session', 'disabled-user'] as const) {
  test(`${mode}: existing browser loses pages, new media/playback grants and mutations immediately`, async ({
    browser,
  }) => {
    const db = await staffClient(),
      sql = new pg.Client({ connectionString: process.env.DATABASE_URL });
    const context = await browser.newContext(),
      page = await context.newPage();
    await sql.connect();
    let changed = false;
    try {
      await login(page, 2);
      await page.goto('/profile');
      const original = (
        await sql.query('select first_name from public.profiles where id=$1', [accounts[2].id])
      ).rows[0].first_name;
      await page.getByLabel('Имя', { exact: true }).fill('This mutation must never persist');
      const video = demoCourses()[0].modules[0].lessons[0].blocks.find(
        (block) => block.type === 'video',
      )!;
      const mediaPath = `/api/media/${fixtureId('asset-pdf-0')}?download=1`,
        playbackPath = `/api/playback/${fixtureId('lesson-0-0')}/${video.id}`;
      expect((await page.request.get(mediaPath, { maxRedirects: 0 })).status()).toBe(307);
      expect((await page.request.get(playbackPath)).status()).toBe(200);
      if (mode === 'disabled-user') {
        const result = await db.rpc('set_user_disabled', {
          target_user: accounts[2].id,
          disabled: true,
        });
        expect(result.error).toBeNull();
        expect(result.data).toMatchObject({ ok: true });
        changed = true;
      } else {
        const removed = await sql.query(
          'delete from auth.sessions where id=(select id from auth.sessions where user_id=$1 order by created_at desc limit 1) returning id',
          [accounts[2].id],
        );
        expect(removed.rowCount).toBe(1);
      }
      expect((await page.request.get(mediaPath, { maxRedirects: 0 })).status()).toBe(401);
      expect((await page.request.get(playbackPath)).status()).toBe(401);
      await page.getByRole('button', { name: 'Сохранить изменения', exact: true }).click();
      await expect(page).toHaveURL(/\/login/);
      expect(
        (await sql.query('select first_name from public.profiles where id=$1', [accounts[2].id]))
          .rows[0].first_name,
      ).toBe(original);
      for (const path of [
        '/dashboard',
        '/courses/ai-product',
        '/courses/ai-product/lessons/lesson-1',
      ]) {
        await page.goto(path);
        await expect(page).toHaveURL(/\/login/);
      }
    } finally {
      if (changed) {
        const result = await db.rpc('set_user_disabled', {
          target_user: accounts[2].id,
          disabled: false,
        });
        expect(result.error).toBeNull();
        expect(result.data).toMatchObject({ ok: true });
      }
      await context.close();
      await sql.end();
    }
    writeFileSync(
      qaPath(`evidence/${mode}.json`),
      JSON.stringify(
        {
          status: 'PASS',
          checks: [
            'access allowed before revocation',
            'new media grant 401',
            'new playback grant 401',
            'existing rendered form mutation denied and DB unchanged',
            'dashboard/course/lesson redirect to login',
            'local fixture state cleanup completed',
          ],
          scope:
            'Existing valid browser session tested over same-origin HTTP. Previously issued bearer download/signed playback permits remain valid only until their short TTL.',
        },
        null,
        2,
      ),
    );
  });
}
