import { test, expect, type Page } from './test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { login } from './helpers';
import { fixtureId } from '../../scripts/fixtures';
import AxeBuilder from '@axe-core/playwright';
const sizes = [
  [375, 812],
  [390, 844],
  [430, 932],
  [768, 1024],
  [1024, 768],
  [1440, 900],
  [1920, 1080],
];
// Separate layout scenarios keep reused QA identities within real media quotas.
// The per-test fixture resets only local counters; rate enforcement stays on.
for (const group of ['core', 'additional'] as const) {
  test(`${group} screens: all seven viewports, desktop/mobile evidence, themes and console`, async ({
    browser,
  }, testInfo) => {
    test.setTimeout(240000);
    mkdirSync('docs/qa/screenshots', { recursive: true });
    const results: object[] = [];
    const studentContext = await browser.newContext(),
      adminContext = await browser.newContext(),
      publicContext = await browser.newContext();
    const student = await studentContext.newPage(),
      admin = await adminContext.newPage(),
      publicPage = await publicContext.newPage();
    const errors: string[] = [],
      consoleErrors: string[] = [],
      failedResponses: object[] = [];
    for (const page of [student, admin, publicPage]) {
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (message) => {
        if (message.type() === 'error' || message.type() === 'warning')
          consoleErrors.push(message.text());
      });
      page.on('response', (response) => {
        if (
          response.status() >= 400 &&
          new URL(response.url()).origin === 'http://localhost:3000'
        ) {
          failedResponses.push({
            status: response.status(),
            path: new URL(response.url()).pathname.replace(
              /\/api\/download\/.*/,
              '/api/download/[redacted]',
            ),
          });
          writeFileSync(
            'docs/qa/evidence/responsive-http-diagnostic.json',
            JSON.stringify({ executedAt: new Date().toISOString(), failedResponses }, null, 2),
          );
        }
      });
    }
    await login(student, 2);
    await login(admin, 0);
    const screens: { name: string; path: string; page: Page; editor?: boolean }[] = [
      { name: 'student-home', path: '/dashboard', page: student },
      { name: 'catalog', path: '/courses', page: student },
      { name: 'course', path: '/courses/ai-product', page: student },
      { name: 'lesson', path: '/courses/ai-product/lessons/lesson-1', page: student },
      { name: 'login', path: '/login', page: publicPage },
      { name: 'admin-home', path: '/admin', page: admin },
      { name: 'admin-courses', path: '/admin/courses', page: admin },
      { name: 'course-editor', path: `/admin/courses/${fixtureId('course-0')}`, page: admin },
      {
        name: 'lesson-editor',
        path: `/admin/courses/${fixtureId('course-0')}?lesson=${fixtureId('lesson-0-0')}`,
        page: admin,
        editor: true,
      },
      { name: 'users', path: '/admin/users', page: admin },
      { name: 'academy-entry', path: '/', page: publicPage },
      { name: 'register', path: '/register', page: publicPage },
      { name: 'profile', path: '/profile', page: student },
      { name: 'library', path: '/library', page: student },
      { name: 'saved', path: '/saved', page: student },
      { name: 'search', path: '/search', page: student },
      { name: 'categories', path: '/admin/categories', page: admin },
      { name: 'media', path: '/admin/media', page: admin },
      { name: 'analytics', path: '/admin/analytics', page: admin },
      { name: 'settings', path: '/admin/settings', page: admin },
      { name: 'audit', path: '/admin/audit', page: admin },
    ];
    let completed = false;
    try {
      for (const screen of group === 'core' ? screens.slice(0, 10) : screens.slice(10)) {
        await screen.page.setViewportSize({ width: 1440, height: 900 });
        await screen.page.goto(screen.path);
        await expect(screen.page.locator('main')).toBeVisible();
        if (screen.editor)
          await expect(screen.page.getByRole('textbox', { name: 'Текст урока' })).toBeVisible();
        const accessibility = await new AxeBuilder({ page: screen.page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze();
        writeFileSync(
          `docs/qa/evidence/a11y-${screen.name}.json`,
          JSON.stringify(
            { violations: accessibility.violations, passes: accessibility.passes.length },
            null,
            2,
          ),
        );
        expect
          .soft(
            accessibility.violations.map((v) => ({
              id: v.id,
              targets: v.nodes.map((n) => n.target),
            })),
            screen.name + ' accessibility',
          )
          .toEqual([]);
        for (const [width, height] of sizes) {
          await screen.page.setViewportSize({ width, height });
          await expect
            .poll(() => screen.page.evaluate(() => document.documentElement.scrollWidth), {
              timeout: 3000,
            })
            .toBeLessThanOrEqual(width + 1);
          const overflow = await screen.page.evaluate(() => ({
            viewport: innerWidth,
            document: document.documentElement.scrollWidth,
          }));
          expect(
            overflow.document,
            `${screen.name} horizontal overflow at ${width}`,
          ).toBeLessThanOrEqual(width + 1);
          results.push({ screen: screen.name, width, height, overflow: false });
          if (width === 390 || width === 1440) {
            if (width === 390) {
              if (screen.name === 'analytics') {
                const table = screen.page.getByRole('region', { name: 'Аналитика по программам' });
                await table.focus();
                await expect(table).toBeFocused();
                await screen.page.keyboard.press('ArrowRight');
                await expect
                  .poll(() => table.evaluate((node) => node.scrollLeft))
                  .toBeGreaterThan(0);
                await table.evaluate((node) => {
                  node.scrollLeft = 0;
                  (node as HTMLElement).blur();
                });
              }
              const smallTargets = await screen.page
                .locator('a, button, select')
                .evaluateAll((elements) =>
                  elements
                    .filter((el) => {
                      const box = el.getBoundingClientRect(),
                        style = getComputedStyle(el);
                      return (
                        box.width > 0 &&
                        box.height > 0 &&
                        style.visibility !== 'hidden' &&
                        !el.closest('.sr-only') &&
                        (box.width < 43.5 || box.height < 43.5)
                      );
                    })
                    .map((el) => ({
                      tag: el.tagName,
                      label: el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 70),
                      class: el.className,
                      width: Math.round(el.getBoundingClientRect().width),
                      height: Math.round(el.getBoundingClientRect().height),
                    })),
                );
              writeFileSync(
                `docs/qa/evidence/touch-${screen.name}.json`,
                JSON.stringify(smallTargets, null, 2),
              );
              expect.soft(smallTargets, screen.name + ' mobile touch targets').toEqual([]);
              const mobileA11y = await new AxeBuilder({ page: screen.page })
                .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
                .analyze();
              writeFileSync(
                `docs/qa/evidence/a11y-${screen.name}-mobile.json`,
                JSON.stringify({ violations: mobileA11y.violations }, null, 2),
              );
              expect
                .soft(
                  mobileA11y.violations.map((v) => ({
                    id: v.id,
                    targets: v.nodes.map((n) => n.target),
                  })),
                  screen.name + ' mobile accessibility',
                )
                .toEqual([]);
            }
            await screen.page.locator('img').evaluateAll(async (images) => {
              await Promise.all(
                images.map((img) => {
                  const image = img as HTMLImageElement;
                  image.loading = 'eager';
                  return image.complete
                    ? Promise.resolve()
                    : new Promise((resolve) => {
                        image.addEventListener('load', resolve, { once: true });
                        image.addEventListener('error', resolve, { once: true });
                        setTimeout(resolve, 5000);
                      });
                }),
              );
            });
            await expect
              .poll(
                () =>
                  screen.page
                    .locator('img')
                    .evaluateAll(
                      (images) =>
                        images.filter(
                          (image) =>
                            !(image as HTMLImageElement).complete ||
                            !(image as HTMLImageElement).naturalWidth,
                        ).length,
                    ),
                { timeout: 10000 },
              )
              .toBe(0);
            await screen.page.screenshot({
              path: `docs/qa/screenshots/${screen.name}-${width === 390 ? 'mobile' : 'desktop'}.png`,
              fullPage: true,
            });
          }
        }
        await screen.page.getByRole('button', { name: 'Переключить тему' }).click();
        await expect(screen.page.locator('html')).toHaveClass(/dark/);
        const darkA11y = await new AxeBuilder({ page: screen.page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze();
        writeFileSync(
          `docs/qa/evidence/a11y-${screen.name}-dark.json`,
          JSON.stringify({ violations: darkA11y.violations }, null, 2),
        );
        expect
          .soft(
            darkA11y.violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })),
            screen.name + ' dark accessibility',
          )
          .toEqual([]);
        await screen.page.screenshot({
          path: `docs/qa/screenshots/${screen.name}-dark.png`,
          fullPage: true,
        });
        await screen.page.getByRole('button', { name: 'Переключить тему' }).click();
      }
      expect(errors).toEqual([]);
      expect(consoleErrors).toEqual([]);
      expect(failedResponses).toEqual([]);
      completed = true;
    } finally {
      writeFileSync(
        `docs/qa/evidence/${group === 'core' ? 'responsive' : 'responsive-secondary'}.json`,
        JSON.stringify(
          {
            executedAt: new Date().toISOString(),
            status: completed && !testInfo.errors.length ? 'PASS' : 'FAIL',
            results,
            pageErrors: errors,
            consoleErrors,
            failedResponses,
          },
          null,
          2,
        ),
      );
      await Promise.all([studentContext.close(), adminContext.close(), publicContext.close()]);
    }
  });
}
test('mobile lesson drawer, focus return, keyboard and reduced motion', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await login(page, 2);
  await page.goto('/courses/ai-product/lessons/lesson-1');
  const trigger = page.getByRole('button', { name: 'Программа курса', exact: true });
  await trigger.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await page.getByRole('button', { name: 'Открыть меню' }).click();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Открыть меню' })).toBeFocused();
});
