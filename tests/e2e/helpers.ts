import { readFileSync } from 'node:fs';
import { TOTP, Secret } from 'otpauth';
import { expect, type Page } from '@playwright/test';
export const accounts = JSON.parse(readFileSync('.local/seed-accounts.json', 'utf8')) as {
  id: string;
  email: string;
  password: string;
  role: string;
  factorId: string;
  totpSecret: string;
}[];
export async function login(page: Page, index: number) {
  const a = accounts[index];
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(a.email);
  await page.getByLabel('Пароль', { exact: true }).fill(a.password);
  await page.getByRole('button', { name: 'Войти в академию' }).click();
  if (a.role !== 'student') {
    await expect(page).toHaveURL(/\/mfa/);
    await page
      .getByLabel('Код из приложения')
      .fill(new TOTP({ secret: Secret.fromBase32(a.totpSecret) }).generate());
    await page.getByRole('button', { name: 'Подтвердить вход' }).click();
    await expect(page).toHaveURL(/\/admin$/);
  } else await expect(page).toHaveURL(/\/dashboard$/);
}
// Browser cookies stay in memory: do not print/save JWTs or Auth storage payloads.
export async function browserSessionId(page: Page): Promise<string> {
  try {
    const parts = (await page.context().cookies())
      .filter((cookie) => /-auth-token(?:\.\d+)?$/.test(cookie.name))
      .sort((a, b) => Number(a.name.split('.').at(-1)) - Number(b.name.split('.').at(-1)));
    const encoded = parts.map((cookie) => cookie.value).join('');
    if (!encoded.startsWith('base64-')) throw new Error();
    const session = JSON.parse(Buffer.from(encoded.slice(7), 'base64url').toString('utf8'));
    const claims = JSON.parse(
      Buffer.from(session.access_token.split('.')[1], 'base64url').toString('utf8'),
    );
    if (typeof claims.session_id !== 'string' || !/^[a-f0-9-]{36}$/.test(claims.session_id))
      throw new Error();
    return claims.session_id;
  } catch {
    throw new Error('Cannot identify actual browser session');
  }
}
