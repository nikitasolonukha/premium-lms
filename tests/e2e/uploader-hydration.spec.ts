import { test, expect } from './test';
import { login } from './helpers';
import { writeFileSync } from 'node:fs';
import { qaPath } from '../../scripts/qa-paths.mjs';

test('cold SSR upload controls remain disabled until their change handler is hydrated', async ({
  browser,
}) => {
  const authenticated = await browser.newContext(),
    loginPage = await authenticated.newPage();
  await login(loginPage, 0);
  const cold = await browser.newContext();
  await cold.addCookies(await authenticated.cookies());
  let release!: () => void,
    blockedScripts = 0;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await cold.route(/\/_next\/static\/.*\.js(?:\?.*)?$/, async (route) => {
    blockedScripts++;
    await gate;
    await route.continue();
  });
  const page = await cold.newPage();
  try {
    await page.goto('/admin/media', { waitUntil: 'commit' });
    const field = page.locator('.upload-field');
    const button = field
      .getByRole('button', { name: 'Загрузить файл' })
      .and(field.locator('button'));
    await expect(field).toBeVisible();
    await expect.poll(() => blockedScripts).toBeGreaterThan(0);
    await expect(field.locator('input[type=file]')).toBeDisabled();
    await expect(button).toBeDisabled();
    release();
    await expect(field.locator('input[type=file]')).toBeEnabled();
    await expect(button).toBeEnabled();
  } finally {
    release();
    await cold.close();
    await authenticated.close();
  }
  writeFileSync(
    qaPath('evidence/uploader-hydration.json'),
    JSON.stringify(
      {
        status: 'PASS',
        checks: [
          'fresh browser cache',
          'client JS intentionally delayed',
          'SSR file input and button disabled',
          'file change controls enabled after actual hydration',
        ],
        scope: 'Real production SSR and client hydration, with unchanged server upload validation.',
      },
      null,
      2,
    ),
  );
});
