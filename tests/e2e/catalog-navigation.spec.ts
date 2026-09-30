import { test, expect } from './test';
import { login } from './helpers';
import { writeFileSync } from 'node:fs';
import { qaPath } from '../../scripts/qa-paths.mjs';

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
]) {
  test(`catalog filters preserve scroll and URL state at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await login(page, 2);
    await page.goto('/courses?sort=title');
    await page.evaluate(() => document.fonts.ready);
    const measurements: object[] = [];
    for (const tag of ['ИИ', 'мышление', 'Все темы']) {
      const link = page.getByRole('link', { name: tag, exact: true });
      await expect(link).toBeVisible();
      await page.evaluate(() => {
        const filters = document.querySelector('.filter-tabs')!;
        window.scrollTo({
          top: filters.getBoundingClientRect().top + scrollY - 112,
          behavior: 'instant',
        });
      });
      const before = await page.evaluate(() => scrollY);
      expect(before).toBeGreaterThan(50);
      await link.click();
      await expect(page.locator('.filter-tab.active')).toHaveText(tag);
      await page.waitForLoadState('networkidle');
      const query = new URL(page.url()).searchParams;
      expect(query.get('sort')).toBe('title');
      expect(query.get('page')).toBe('1');
      expect(query.get('tag')).toBe(tag === 'Все темы' ? '' : tag);
      await expect
        .poll(async () => Math.abs((await page.evaluate(() => scrollY)) - before))
        .toBeLessThanOrEqual(3);
      measurements.push({ tag, before, after: await page.evaluate(() => scrollY) });
    }
    const beforeTheme = await page.evaluate(() => scrollY);
    await page.getByRole('button', { name: 'Переключить тему' }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    expect(Math.abs((await page.evaluate(() => scrollY)) - beforeTheme)).toBeLessThanOrEqual(3);
    writeFileSync(
      qaPath(`evidence/catalog-scroll-${viewport.width}.json`),
      JSON.stringify(
        {
          status: 'PASS',
          viewport,
          checks:
            'tag filtering preserves visible position and sort/page/tag URL; theme switch preserves scroll',
          measurements,
        },
        null,
        2,
      ),
    );
  });
}
