import { qaPath } from '../../scripts/qa-paths.mjs';
import { test, expect } from './test';
import { writeFileSync } from 'node:fs';
import { login, accounts } from './helpers';
import { staffClient, fixtureCourse } from './db-fixtures';

test('discovery: RU/EN search, taxonomy, partial words, URL filters, saved and revocation', async ({
  page,
  browser,
}) => {
  test.setTimeout(90000);
  const db = await staffClient(),
    course = await fixtureCourse(db),
    other = await browser.newPage();
  course.title = 'Research — практика осмысленного исследования';
  course.tags = ['DiscoveryQA'];
  course.modules[0].lessons[0].title = 'Researching — исследование гипотез';
  try {
    const saved = await db.rpc('save_course', { doc: course, expected_version: course.version });
    expect(saved.error).toBeNull();
    expect(
      (await db.rpc('catalog', { q: 'DiscoveryQA', staff: true, status_filter: 'draft' })).data
        .total,
    ).toBe(1);
    await db.rpc('publish_course', { cid: course.id, expected_version: saved.data.version });
    expect(
      (await db.rpc('catalog', { q: 'DiscoveryQA', staff: true, status_filter: 'draft' })).data
        .total,
    ).toBe(0);
    expect(
      (await db.rpc('catalog', { q: 'DiscoveryQA', staff: true, status_filter: 'published' })).data
        .total,
    ).toBe(1);
    await db.rpc('set_access', { cid: course.id, target_user: accounts[2].id, enabled: true });
    await login(page, 2);
    for (const q of ['RESEA', 'research', 'исследования', 'DiscoveryQA']) {
      await page.goto('/search?q=' + encodeURIComponent(q));
      await expect(page.locator('.course-card h3').filter({ hasText: course.title })).toHaveCount(
        1,
      );
    }
    for (const q of ['research', 'исследования', 'RESEAR']) {
      await page.goto('/search?tab=lessons&q=' + encodeURIComponent(q));
      await expect(
        page.getByRole('heading', { name: course.modules[0].lessons[0].title, exact: true }),
      ).toBeVisible();
    }
    await page.goto('/courses?q=' + encodeURIComponent('Искусственный интеллект'));
    await expect(page.locator('.course-card h3').filter({ hasText: course.title })).toHaveCount(1);
    await page.getByLabel('Поиск программ').fill('Research');
    await page.locator('.catalog-advanced summary').click();
    await page.getByLabel('Категория', { exact: true }).selectOption(course.categoryId!);
    await page.getByLabel('Сортировка').selectOption('title');
    await page.getByRole('button', { name: 'Применить фильтры', exact: true }).click();
    await expect(page).toHaveURL(/q=Research/);
    await page.getByRole('link', { name: 'DiscoveryQA', exact: true }).click();
    await expect(page).toHaveURL(/tag=DiscoveryQA/);
    await page.reload();
    await expect(page.getByLabel('Поиск программ')).toHaveValue('Research');
    await expect(page.getByLabel('Категория', { exact: true })).toHaveValue(course.categoryId!);
    await expect(page.getByLabel('Сортировка')).toHaveValue('title');
    expect(new URL(page.url()).searchParams.get('tag')).toBe('DiscoveryQA');
    await expect(page.locator('.course-card')).toHaveCount(1);
    await page.goto('/courses?q=definitely-nothing-qa');
    await page.getByRole('link', { name: 'Сбросить фильтры' }).click();
    await expect(page).toHaveURL(/\/courses$/);
    await page.goto('/search');
    await expect(page.getByRole('heading', { name: 'С чего начнём?' })).toBeVisible();
    await page.goto(`/courses/${course.slug}`);
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Удалить из сохранённого' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.goto('/saved');
    await expect(page.locator('.course-card h3').filter({ hasText: course.title })).toHaveCount(1);
    await login(other, 3);
    await other.goto('/search?q=DiscoveryQA');
    await expect(other.locator('.course-card')).toHaveCount(0);
    await expect(other.getByRole('link', { name: 'Программы · 0', exact: true })).toBeVisible();
    await db.rpc('set_access', { cid: course.id, target_user: accounts[2].id, enabled: false });
    await page.reload();
    await expect(page.locator('.course-card h3').filter({ hasText: course.title })).toHaveCount(0);
    writeFileSync(
      qaPath('evidence/discovery.json'),
      JSON.stringify(
        {
          status: 'PASS',
          executedAt: new Date().toISOString(),
          checks: [
            'RU/EN stemming and case-insensitive partial title search',
            'category and tag search',
            'combined filters persist in URL after reload',
            'reset filters and empty query',
            'status filtering before counts and pagination',
            'saved course disappears on revoke',
            'B search and counts exclude restricted course',
          ],
        },
        null,
        2,
      ),
    );
  } finally {
    await db.rpc('delete_course', { cid: course.id });
    await other.close();
  }
});
