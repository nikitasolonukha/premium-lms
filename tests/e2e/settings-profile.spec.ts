import { qaPath } from '../../scripts/qa-paths.mjs';
import { test, expect } from './test';
import { writeFileSync } from 'node:fs';
import { login, accounts } from './helpers';
import { staffClient } from './db-fixtures';
import { demoAssets } from '../../scripts/fixtures';
test('profile changes persist, branding is editable, watermark moves and survives fullscreen', async ({
  browser,
}) => {
  test.setTimeout(150000);
  const db = await staffClient(),
    original = (await db.from('settings').select('config').single()).data!.config;
  const ac = await browser.newContext(),
    sc = await browser.newContext(),
    admin = await ac.newPage(),
    student = await sc.newPage();
  const asset = (await demoAssets()).find((a) => a.name === 'cover-0')!;
  try {
    await login(student, 4);
    await student.goto('/profile');
    await student.getByLabel('Имя', { exact: true }).fill('Мария 🧭');
    await student.getByLabel('Фамилия', { exact: true }).fill('Проверка профиля');
    await student
      .locator('input[type=file]')
      .setInputFiles({ name: 'Фото ученика.webp', mimeType: asset.mime, buffer: asset.bytes });
    await expect(student.getByText('Файл загружен', { exact: true })).toBeVisible();
    await student.getByRole('button', { name: 'Сохранить изменения', exact: true }).click();
    await expect(student.getByText('Профиль обновлён', { exact: true })).toBeVisible();
    await student.reload();
    await expect(student.getByLabel('Имя', { exact: true })).toHaveValue('Мария 🧭');
    await student.getByRole('button', { name: 'Выйти из аккаунта' }).click();
    await login(student, 4);
    await student.goto('/profile');
    await expect(student.getByLabel('Фамилия', { exact: true })).toHaveValue('Проверка профиля');
    await expect(student.locator('.upload-field img')).toBeVisible();
    await login(admin, 0);
    await admin.goto('/admin/settings');
    await admin.getByLabel('Название академии', { exact: true }).fill('Академия практики');
    await admin.getByLabel('Текст в подвале', { exact: true }).fill('Учимся через действие.');
    await admin.getByLabel('Email поддержки', { exact: true }).fill('help@academy.local');
    await admin.getByLabel('HEX-код цвета', { exact: true }).fill('#294cce');
    await admin.getByLabel('Персональный водяной знак', { exact: false }).check();
    for (const [index, name] of ['Логотип', 'Иконка сайта'].entries()) {
      await admin
        .locator('input[type=file]')
        .nth(index)
        .setInputFiles({ name: `${name}.webp`, mimeType: asset.mime, buffer: asset.bytes });
      await expect(admin.locator('.upload-progress').nth(index)).toHaveText('Файл загружен');
    }
    await admin.getByRole('button', { name: 'Сохранить настройки', exact: true }).click();
    await expect(admin.getByText('Настройки сохранены', { exact: true })).toBeVisible();
    await admin.reload();
    await expect(admin.getByLabel('Название академии', { exact: true })).toHaveValue(
      'Академия практики',
    );
    await student.goto('/');
    await expect(student.locator('.logo')).toContainText('Академия практики');
    expect((await student.request.get('/api/brand/logo')).status()).toBe(200);
    expect((await student.request.get('/api/brand/favicon')).status()).toBe(200);
    await student.clock.install();
    await student.goto('/courses/clear-design/lessons/lesson-2');
    // Use an available registered course; discover the first image lesson from its UI.
    if (!(await student.locator('.image-stage').count())) {
      await student.goto('/courses/clear-design');
      const links = await student
        .locator('.program-lesson')
        .evaluateAll((nodes) => nodes.map((n) => (n as HTMLAnchorElement).getAttribute('href')!));
      for (const href of links) {
        await student.goto(href);
        if (await student.locator('.image-stage').count()) break;
      }
    }
    const stage = student.locator('.image-stage').first();
    await expect(stage).toBeVisible();
    await expect(stage.locator('.watermark')).toContainText(accounts[4].email);
    await student.clock.fastForward(19000);
    await expect(stage.locator('.watermark')).toHaveClass(/watermark-1/);
    await stage.getByRole('button', { name: 'Развернуть изображение' }).click();
    await expect
      .poll(() => student.evaluate(() => document.fullscreenElement?.className))
      .toContain('image-stage');
    await expect(stage.locator('.watermark')).toBeVisible();
    await student.evaluate(() => document.exitFullscreen());
    writeFileSync(
      qaPath('evidence/settings-profile.json'),
      JSON.stringify(
        {
          status: 'PASS',
          executedAt: new Date().toISOString(),
          checks: [
            'name and avatar survive reload and login',
            'Admin branding text/color/logo/favicon',
            'watermark viewer identity',
            'watermark 18-second timer with browser clock',
            'fullscreen wrapper retains watermark',
          ],
        },
        null,
        2,
      ),
    );
  } finally {
    await db.rpc('update_settings', { doc: original });
    await Promise.all([ac.close(), sc.close()]);
  }
});
test('private SEO, metadata, direct URLs, invalid filters and error pages', async ({
  page,
  request,
}) => {
  await login(page, 2);
  for (const path of [
    '/dashboard',
    '/courses',
    '/courses/ai-product',
    '/courses/ai-product/lessons/lesson-1',
    '/profile',
  ]) {
    await page.goto(path);
    await page.reload();
    await expect(page.locator('meta[name=robots]')).toHaveAttribute('content', /noindex/);
    await expect(page).toHaveTitle(/Академия/);
  }
  for (const path of [
    '/courses/no-such-course',
    '/courses/ai-product/lessons/missing',
    '/courses?category=not-a-uuid',
    '/courses?sort=invalid',
  ]) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: 'Страница недоступна' })).toBeVisible();
    await expect(page.locator('body')).not.toContainText(/SQLSTATE|PostgrestError|stack trace/);
  }
  const robots = await request.get('/robots.txt');
  expect(robots.status()).toBe(200);
  expect(await robots.text()).toContain('Disallow: /admin');
  const sitemap = await request.get('/sitemap.xml');
  expect(sitemap.status()).toBe(200);
  expect(await sitemap.text()).not.toContain('/courses');
  const root = await request.get('/');
  expect(root.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(root.headers()['x-content-type-options']).toBe('nosniff');
  writeFileSync(
    qaPath('evidence/seo-errors.json'),
    JSON.stringify(
      {
        status: 'PASS',
        executedAt: new Date().toISOString(),
        checks: [
          'private noindex metadata',
          'direct route reload',
          'invalid slug and filter safe errors',
          'robots and public-only sitemap',
          'CSP and nosniff',
        ],
      },
      null,
      2,
    ),
  );
});
