import { test, expect } from './test';
import { mkdirSync } from 'node:fs';
import { login } from './helpers';
test('Student navigates real learning screens', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await login(page, 2);
  // Repeated QA runs preserve UAT progress. Establish the intended last lesson
  // through the real Student page instead of assuming a freshly seeded account.
  await page.goto('/courses/ai-product/lessons/lesson-2');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('От задачи к точной гипотезе');
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Привет, Александр.' })).toBeVisible();
  await expect(page.locator('.continue-cover img')).toBeVisible();
  await expect
    .poll(() =>
      page.locator('.continue-cover img').evaluate((img: HTMLImageElement) => img.naturalWidth),
    )
    .toBeGreaterThan(0);
  mkdirSync('docs/qa/screenshots', { recursive: true });
  await page.screenshot({
    path: 'docs/qa/screenshots/student-dashboard-desktop.png',
    fullPage: true,
  });
  await page.getByRole('link', { name: 'Продолжить обучение' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'От задачи к точной гипотезе',
  );
  await page.goto('/courses');
  await expect(page.getByRole('heading', { name: 'Ваш следующий уровень' })).toBeVisible();
  await page.goto('/courses/ai-product');
  await expect(
    page.getByRole('heading', { name: 'ИИ: от идеи к продукту', exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test('Admin completes MFA and opens CMS', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await login(page, 0);
  await expect(page.getByRole('heading', { name: 'Всё важное — в одном месте' })).toBeVisible();
  await page.getByRole('link', { name: 'Все курсы' }).click();
  await expect(page.getByRole('heading', { name: 'Курсы', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Редактировать ИИ: от идеи к продукту' }).click();
  await expect(page.getByLabel('Название курса')).toHaveValue('ИИ: от идеи к продукту');
  await page.getByRole('tab', { name: 'Уроки', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Содержание урока' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Текст урока' })).toBeVisible();
  await page.screenshot({
    path: 'docs/qa/screenshots/admin-lesson-editor-desktop.png',
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
