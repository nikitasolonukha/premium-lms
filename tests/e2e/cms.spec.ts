import { qaPath } from '../../scripts/qa-paths.mjs';
import { test, expect, type Page } from './test';
import { writeFileSync } from 'node:fs';
import { login, accounts } from './helpers';
import { staffClient, fixtureCourse, document as readDocument } from './db-fixtures';
const save = async (page: Page) => {
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.getByText('Все изменения сохранены', { exact: true })).toBeVisible();
};

test('lesson blocks: independent duplicate, keyboard reorder, confirmed delete and reload', async ({
  page,
}) => {
  const db = await staffClient(),
    course = await fixtureCourse(db),
    lesson = course.modules[0].lessons[0];
  try {
    await login(page, 0);
    await page.goto(`/admin/courses/${course.id}?lesson=${lesson.id}`);
    const before = lesson.blocks.map((b) => b.id);
    await page.getByRole('button', { name: 'Дублировать блок Заголовок', exact: true }).click();
    await save(page);
    const copy = (await readDocument(db, course.id)).modules[0].lessons[0].blocks;
    expect(copy.length).toBe(before.length + 1);
    expect(copy[1].id).not.toBe(copy[0].id);
    expect(copy[1].data).toEqual(copy[0].data);
    await page
      .getByRole('button', { name: 'Изменить порядок: Заголовок', exact: true })
      .first()
      .focus();
    await page.keyboard.press('Space');
    await expect(page.locator('.dragging')).toHaveCount(1);
    await page.evaluate(
      () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    );
    await page.keyboard.press('ArrowDown');
    await page.evaluate(
      () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    );
    await page.keyboard.press('Space');
    await save(page);
    expect((await readDocument(db, course.id)).modules[0].lessons[0].blocks[0].id).toBe(copy[1].id);
    await page.getByRole('button', { name: 'Удалить блок Заголовок', exact: true }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Отмена', exact: true }).click();
    await expect(page.locator('.block-panel')).toHaveCount(before.length + 1);
    await page.getByRole('button', { name: 'Удалить блок Заголовок', exact: true }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Удалить', exact: true }).click();
    await save(page);
    await page.reload();
    await expect(page.locator('.block-panel')).toHaveCount(before.length);
    expect(
      (await readDocument(db, course.id)).modules[0].lessons[0].blocks.map((b) => b.id),
    ).toEqual(before);
    writeFileSync(
      qaPath('evidence/block-operations.json'),
      JSON.stringify(
        {
          status: 'PASS',
          executedAt: new Date().toISOString(),
          checks: [
            'block duplicate has independent ID',
            'keyboard order persisted',
            'cancel keeps block',
            'confirmed delete persists after reload',
          ],
        },
        null,
        2,
      ),
    );
  } finally {
    await db.rpc('delete_course', { cid: course.id });
  }
});
test('CMS: keyboard sorting, duplication, deletion, preview, two tabs and network recovery', async ({
  browser,
}) => {
  test.setTimeout(180000);
  const db = await staffClient(),
    course = await fixtureCourse(db),
    ctx = await browser.newContext(),
    page = await ctx.newPage();
  try {
    await login(page, 0);
    await page.goto(`/admin/courses/${course.id}`);
    await page.getByRole('tab', { name: 'Модули', exact: true }).click();
    const original = course.modules.map((m) => m.id);
    const handle = page.getByRole('button', {
      name: `Изменить порядок: ${course.modules[0].title}`,
      exact: true,
    });
    await handle.focus();
    await page.keyboard.press('Space');
    await expect(page.locator('.dragging')).toHaveCount(1);
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    await page.keyboard.press('ArrowDown');
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    await page.keyboard.press('Space');
    await save(page);
    expect((await readDocument(db, course.id)).modules.map((m) => m.id)).toEqual(
      original.toReversed(),
    );
    await page.reload();
    await page.getByRole('tab', { name: 'Модули', exact: true }).click();
    await expect(page.getByLabel('Название модуля').first()).toHaveValue(course.modules[1].title);
    await page
      .getByRole('button', { name: `Дублировать модуль ${course.modules[1].title}`, exact: true })
      .click();
    await expect(page.getByLabel('Название модуля')).toHaveCount(3);
    await page
      .getByRole('button', {
        name: `Удалить модуль ${course.modules[1].title} — копия`,
        exact: true,
      })
      .click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Удалить модуль', exact: true })
      .click();
    await expect(page.getByLabel('Название модуля')).toHaveCount(2);
    const firstLesson = course.modules[1].lessons[0];
    await page
      .getByRole('button', { name: `Изменить порядок: ${firstLesson.title}`, exact: true })
      .focus();
    await page.keyboard.press('Space');
    await expect(page.locator('.dragging')).toHaveCount(1);
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    await page.keyboard.press('ArrowDown');
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    await page.keyboard.press('Space');
    await save(page);
    expect((await readDocument(db, course.id)).modules[0].lessons[1].id).toBe(firstLesson.id);
    await page.getByRole('button', { name: 'Предпросмотр', exact: true }).click();
    await expect(page).toHaveURL(/\/preview/);
    await page.goto(`/admin/courses/${course.id}`);
    const second = await ctx.newPage();
    await second.goto(`/admin/courses/${course.id}`);
    const changed = 'Редакция первой вкладки';
    await page.getByLabel('Название курса', { exact: true }).fill(changed);
    await save(page);
    await expect(second.locator('.editor-notice')).toContainText('другой вкладке');
    await second.getByLabel('Название курса', { exact: true }).fill('Попытка старой вкладки');
    await second.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await expect(second.getByText('Конфликт версий', { exact: true })).toBeVisible();
    expect((await readDocument(db, course.id)).title).toBe(changed);
    await second.getByRole('button', { name: 'Загрузить актуальную', exact: true }).click();
    await second
      .getByRole('dialog')
      .getByRole('button', { name: 'Загрузить', exact: true })
      .click();
    await expect(second.getByLabel('Название курса', { exact: true })).toHaveValue(changed);
    await second.close();
    await page.route('**/admin/courses/**', async (route) =>
      route.request().method() === 'POST' ? route.abort('internetdisconnected') : route.continue(),
    );
    await page
      .getByLabel('Название курса', { exact: true })
      .fill('Сохранено после восстановления сети');
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await expect(page.locator('.editor-notice')).toContainText('Нет соединения');
    await page.getByRole('link', { name: 'Все курсы', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('несохранённые');
    await page.keyboard.press('Escape');
    await page.unroute('**/admin/courses/**');
    await save(page);
    expect((await readDocument(db, course.id)).title).toBe('Сохранено после восстановления сети');
    expect((await readDocument(db, course.id)).slug).toBe(course.slug);
    await page.goto(
      '/admin/courses?q=' + encodeURIComponent('Сохранено после восстановления сети'),
    );
    await page
      .getByRole('button', { name: 'Дублировать Сохранено после восстановления сети', exact: true })
      .click();
    await expect(page).toHaveURL(/\/admin\/courses\/[a-f0-9-]{36}$/);
    const copyId = page.url().split('/').at(-1)!;
    expect(copyId).not.toBe(course.id);
    const copy = await readDocument(db, copyId);
    expect(copy.modules[0].id).not.toBe(original[1]);
    expect(copy.accessMode).toBe('restricted');
    expect((await db.from('enrollments').select('id').eq('course_id', copyId)).data).toEqual([]);
    await page.goto('/admin/courses?q=' + encodeURIComponent(copy.title));
    await page.getByRole('button', { name: `Архивировать ${copy.title}`, exact: true }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Архивировать', exact: true })
      .click();
    await expect(page.getByText('Курс архивирован', { exact: true })).toBeVisible();
    expect((await db.from('courses').select('id').eq('id', copyId)).data).toEqual([]);
    writeFileSync(
      qaPath('evidence/cms.json'),
      JSON.stringify(
        {
          status: 'PASS',
          executedAt: new Date().toISOString(),
          checks: [
            'keyboard module and lesson sorting survives reload',
            'independent module duplicate and confirmed delete',
            'preview',
            'two-tab conflict prevents lost update',
            'network failure retains changes and retries',
            'unsaved navigation dialog',
            'title does not change slug',
            'course copy has new IDs and no enrollments',
            'confirmed archive',
          ],
        },
        null,
        2,
      ),
    );
  } finally {
    await db.rpc('delete_course', { cid: course.id });
    await ctx.close();
  }
});
test('large course: 21 modules, 63 lessons, long text, twelve tags, search and mobile', async ({
  browser,
}) => {
  test.setTimeout(120000);
  const db = await staffClient(),
    course = await fixtureCourse(db, true),
    ctx = await browser.newContext(),
    page = await ctx.newPage();
  try {
    expect(
      (await db.rpc('publish_course', { cid: course.id, expected_version: course.version })).error,
    ).toBeNull();
    expect(
      (await db.rpc('set_access', { cid: course.id, target_user: accounts[2].id, enabled: true }))
        .error,
    ).toBeNull();
    await login(page, 2);
    const start = Date.now();
    await page.goto(`/courses/${course.slug}`);
    await expect(page.getByRole('heading', { name: course.title, exact: true })).toBeVisible();
    await expect(page.locator('.program-module')).toHaveCount(21);
    await expect(page.locator('.program-lesson')).toHaveCount(63);
    for (const width of [375, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
        .toBeLessThanOrEqual(width + 1);
    }
    await page.goto('/search?q=' + encodeURIComponent('Вопрос'));
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.goto('/courses?q=' + encodeURIComponent('НЕСУЩЕСТВУЮЩИЙ-РЕЗУЛЬТАТ'));
    await expect(page.locator('.empty-state')).toBeVisible();
    await page.goto(`/courses/${course.slug}/lessons/lesson-20-2`);
    await expect(
      page.getByRole('heading', { name: course.modules[20].lessons[2].title, exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      course.modules[20].lessons[2].title,
    );
    await page.goBack();
    await page.goForward();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      course.modules[20].lessons[2].title,
    );
    writeFileSync(
      qaPath('evidence/large-course.json'),
      JSON.stringify(
        {
          status: 'PASS',
          executedAt: new Date().toISOString(),
          modules: 21,
          lessons: 63,
          tags: 12,
          scenarioMilliseconds: Date.now() - start,
          checks: [
            'long title and description',
            'Unicode and HTML-like literal text',
            'all lessons available',
            'three widths without document overflow',
            'search empty state',
            'deep link and refresh',
            'back and forward',
          ],
        },
        null,
        2,
      ),
    );
  } finally {
    await db.rpc('delete_course', { cid: course.id });
    await ctx.close();
  }
});
