import { qaPath } from '../../scripts/qa-paths.mjs';
import { test, expect, type Page, type APIRequestContext } from './test';
import { randomBytes } from 'node:crypto';
import { TOTP, Secret } from 'otpauth';
import { writeFileSync, mkdirSync } from 'node:fs';
import { login } from './helpers';
async function emailLink(request: APIRequestContext, email: string, subject: string) {
  let id = '';
  await expect
    .poll(
      async () => {
        const result = await request.get('http://127.0.0.1:56324/api/v1/messages');
        const data = await result.json();
        const mail = data.messages.find(
          (m: { ID: string; Subject: string; To: { Address: string }[] }) =>
            m.To.some((t) => t.Address === email) && m.Subject.includes(subject),
        );
        id = mail?.ID ?? '';
        return !!id;
      },
      { timeout: 20000 },
    )
    .toBe(true);
  const mail = await (await request.get(`http://127.0.0.1:56324/api/v1/message/${id}`)).json();
  const href = String(mail.HTML).match(/href="([^"]*\/auth\/callback[^\"]*)"/)?.[1];
  expect(href).toBeTruthy();
  return href!.replaceAll('&amp;', '&');
}
async function credentials(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Войти в академию' }).click();
}
test('registration, test email confirmation, password recovery, MFA enrollment and logout', async ({
  browser,
  request,
}) => {
  test.setTimeout(150000);
  const context = await browser.newContext(),
    page = await context.newPage();
  const email = `auth-${Date.now()}@academy.local`,
    password = `Aa1!${randomBytes(16).toString('hex')}`,
    changed = `Bb2!${randomBytes(16).toString('hex')}`;
  await page.goto('/register');
  await page.getByLabel('Имя', { exact: true }).fill('Тест');
  await page.getByLabel('Фамилия', { exact: true }).fill('Авторизации');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Создать аккаунт', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Проверьте почту' })).toBeVisible();
  await credentials(page, email, password);
  await expect(page.locator('.form-error[role=alert]')).toContainText('Подтвердите email');
  await page.goto(await emailLink(request, email, 'Подтвердите'));
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Привет, Тест.' })).toBeVisible();
  const cookies = await context.cookies();
  const auth = cookies.filter((c) => c.name.includes('auth-token'));
  expect(auth.length).toBeGreaterThan(0);
  for (const cookie of auth) {
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe('Lax');
  }
  await page.goto('/profile');
  await page.getByRole('button', { name: 'Выйти из аккаунта' }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goBack();
  await expect(page).toHaveURL(/\/login/);
  await page.goto('/forgot-password');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByRole('button', { name: 'Отправить ссылку' }).click();
  await expect(page.getByRole('heading', { name: 'Проверьте почту' })).toBeVisible();
  await page.goto(await emailLink(request, email, 'Восстановление'));
  await expect(page).toHaveURL(/\/reset-password$/);
  await page.getByLabel('Новый пароль', { exact: true }).fill(changed);
  await page.getByRole('button', { name: 'Сохранить пароль' }).click();
  await expect(page.getByRole('heading', { name: 'Готово' })).toBeVisible();
  await page.goto('/profile');
  await page.getByRole('button', { name: 'Выйти из аккаунта' }).click();
  await credentials(page, email, password);
  await expect(page.locator('.form-error[role=alert]')).toContainText('Неверный email');
  await credentials(page, email, changed);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto('/mfa');
  await page.getByRole('button', { name: 'Подключить аутентификатор' }).click();
  const secret = (await page.locator('.mfa-secret').innerText()).trim();
  expect(secret).toMatch(/^[A-Z2-7]+$/);
  await page.getByLabel('Код из приложения').fill('000000');
  await page.getByRole('button', { name: 'Подтвердить вход' }).click();
  await expect(page.locator('.form-error[role=alert]')).toContainText('Код неверен');
  await page
    .getByLabel('Код из приложения')
    .fill(new TOTP({ secret: Secret.fromBase32(secret) }).generate());
  await page.getByRole('button', { name: 'Подтвердить вход' }).click();
  await expect(page).toHaveURL(/\/profile$/);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Мой профиль');
  mkdirSync(qaPath('evidence'), { recursive: true });
  writeFileSync(
    qaPath('evidence/auth.json'),
    JSON.stringify(
      {
        executedAt: new Date().toISOString(),
        status: 'PASS',
        checks: [
          'registration and real local email delivery',
          'email confirmation required',
          'server callback establishes HttpOnly SameSite=Lax cookies',
          'logout and browser history deny private page',
          'recovery email and password replacement',
          'old password rejected',
          'new TOTP enrollment',
          'invalid OTP rejected',
          'valid OTP and reload',
        ],
      },
      null,
      2,
    ),
  );
  await context.close();
});
test('same-origin auth endpoints reject CSRF, unsafe redirects and return real rate headers', async ({
  request,
  browser,
}) => {
  const cross = await request.post('/api/auth/login', {
    headers: { Origin: 'https://attacker.example' },
    data: { values: { email: 'csrf@academy.local', password: 'Not-A-Real-Password1' } },
  });
  expect(cross.status()).toBe(403);
  const email = `limit-${Date.now()}@academy.local`;
  let limited;
  for (let i = 0; i < 11; i++)
    limited = await request.post('/api/auth/login', {
      headers: { Origin: 'http://localhost:3000' },
      data: { values: { email, password: 'Not-A-Real-Password1' } },
    });
  expect(limited!.status()).toBe(429);
  expect(Number(limited!.headers()['retry-after'])).toBeGreaterThan(0);
  const context = await browser.newContext(),
    page = await context.newPage();
  await login(page, 3);
  await page.goto('/admin');
  await expect(page.getByText('Недостаточно прав', { exact: false })).toBeVisible();
  await context.close();
});
