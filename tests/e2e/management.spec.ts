import { qaPath } from '../../scripts/qa-paths.mjs';
import { test, expect } from './test';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { login, accounts } from './helpers';
import { staffClient } from './db-fixtures';
import { fixtureId } from '../../scripts/fixtures';

test('user directory: pagination, role/email/course filters, role and disable UI; category integrity', async ({
  page,
}) => {
  test.setTimeout(150000);
  const db = await staffClient(),
    service = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  const ids: string[] = [],
    prefix = `directory-${randomUUID().slice(0, 8)}`;
  try {
    for (let i = 0; i < 25; i++) {
      const created = await service.auth.admin.createUser({
        email: `${prefix}-${i}@academy.local`,
        email_confirm: i % 2 === 0,
        user_metadata: { first_name: 'Тест', last_name: `${i}` },
      });
      expect(created.error).toBeNull();
      ids.push(created.data.user!.id);
    }
    await login(page, 0);
    await page.goto('/admin/users?q=' + prefix);
    await expect(page.locator('tbody tr')).toHaveCount(20);
    const firstPage = await page.locator('tbody tr').allTextContents();
    await page.getByRole('link', { name: /Далее/ }).click();
    await expect(page.locator('tbody tr')).toHaveCount(5);
    expect(
      (await page.locator('tbody tr').allTextContents()).some((t) => firstPage.includes(t)),
    ).toBe(false);
    await page.goto('/admin/users?q=' + prefix + '&verified=yes');
    await expect(page.locator('tbody tr')).toHaveCount(13);
    await page.getByLabel('Подтверждение email').selectOption('no');
    await page.getByRole('button', { name: 'Найти', exact: true }).click();
    await expect(page.locator('tbody tr')).toHaveCount(12);
    await page.goto('/admin/users?role=editor');
    await expect(page.locator('tbody tr')).toHaveCount(1);
    await expect(page.locator('tbody')).toContainText(accounts[1].email);
    await page.goto('/admin/users');
    await page.getByRole('button', { name: 'Все курсы', exact: true }).click();
    await page.getByLabel('Найти курс для фильтра').fill('ИИ');
    await page.locator('.course-filter-option').filter({ hasText: 'ИИ: от идеи' }).first().click();
    await page.getByRole('button', { name: 'Найти', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`course=${fixtureId('course-0')}`));
    await expect(page.locator('tbody')).toContainText(accounts[2].email);
    await expect(page.locator('tbody')).not.toContainText(accounts[3].email);
    const targetEmail = `${prefix}-0@academy.local`;
    await page.goto('/admin/users?q=' + encodeURIComponent(targetEmail));
    await page.getByRole('button', { name: `Управлять пользователем ${targetEmail}` }).click();
    await page.getByLabel('Роль пользователя').selectOption('editor');
    await page.getByRole('button', { name: 'Изменить', exact: true }).click();
    await page
      .getByRole('dialog')
      .last()
      .getByRole('button', { name: 'Подтвердить', exact: true })
      .click();
    await expect(page.getByText('Роль изменена', { exact: true })).toBeVisible();
    expect(
      (await db.from('user_roles').select('role').eq('user_id', ids[0]).single()).data?.role,
    ).toBe('editor');
    await page.getByRole('button', { name: 'Отключить аккаунт', exact: true }).click();
    await page
      .getByRole('dialog')
      .last()
      .getByRole('button', { name: 'Отключить', exact: true })
      .click();
    await expect(page.locator('tbody')).toContainText('Отключён');
    await page.getByRole('button', { name: `Управлять пользователем ${targetEmail}` }).click();
    await page.getByRole('button', { name: 'Включить', exact: true }).click();
    await page
      .getByRole('dialog')
      .last()
      .getByRole('button', { name: 'Включить', exact: true })
      .click();
    await expect(page.locator('tbody')).toContainText('Активен');
    await page.goto('/admin/categories');
    const category = `Практика ${prefix}`;
    await page.getByLabel('Новая категория').fill(category);
    await page.getByRole('button', { name: 'Добавить', exact: true }).click();
    await expect(page.getByText('Категория добавлена', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: `Удалить категорию ${category}` })).toBeVisible();
    await page.getByRole('button', { name: `Удалить категорию ${category}` }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Удалить', exact: true }).click();
    await expect(page.getByRole('button', { name: `Удалить категорию ${category}` })).toHaveCount(
      0,
    );
    await page
      .getByRole('button', { name: 'Удалить категорию Продукт и стратегия', exact: true })
      .click();
    await page.getByRole('dialog').getByRole('button', { name: 'Удалить', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(
      (await db.from('categories').select('id').eq('id', fixtureId('category-0'))).data?.length,
    ).toBe(1);
    await page.keyboard.press('Escape');
    writeFileSync(
      qaPath('evidence/management.json'),
      JSON.stringify(
        {
          status: 'PASS',
          executedAt: new Date().toISOString(),
          checks: [
            '25 users in 20+5 pages without overlap',
            'confirmed/unconfirmed email filters',
            'role and course filters',
            'UI role change and disable/re-enable',
            'category create, reload, delete',
            'used category deletion rejected',
          ],
        },
        null,
        2,
      ),
    );
  } finally {
    for (const id of ids) await service.auth.admin.deleteUser(id);
  }
});
