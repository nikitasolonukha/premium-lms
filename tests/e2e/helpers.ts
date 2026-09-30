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
