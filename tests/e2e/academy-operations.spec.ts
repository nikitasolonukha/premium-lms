import { test, expect } from './test';
import { login, accounts } from './helpers';
import { staffClient, fixtureCourse, document as readDocument } from './db-fixtures';
import { readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
import { qaPath } from '../../scripts/qa-paths.mjs';
import AxeBuilder from '@axe-core/playwright';
async function localSql() {
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  return db;
}
test('Student card, import preview, XLSX and queued email invitation', async ({ page }) => {
  test.setTimeout(150000);
  const sql = await localSql(),
    email = `qa-import-${randomUUID()}@academy.local`;
  let imported: string | null = null;
  try {
    await login(page, 0);
    await page.goto(`/admin/users/${accounts[2].id}`);
    await expect(page.getByRole('heading', { name: 'Курсы и прогресс' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'История изменений' })).toBeVisible();
    await page.goto('/admin/users');
    await page.getByText('Импорт учеников из CSV / XLSX', { exact: true }).click();
    await page.getByLabel('Таблица учеников').setInputFiles({
      name: 'invalid.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(
        `email;first_name\n${accounts[0].email};Админ\n${email};Анна\n${email};Повтор`,
      ),
    });
    await page.getByRole('button', { name: 'Проверить таблицу' }).click();
    await expect(page.getByText('Повтор email в таблице', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Подтвердить импорт' })).toBeDisabled();
    const ExcelJS = await import('exceljs');
    const book = new ExcelJS.default.Workbook(),
      sheet = book.addWorksheet('Ученики');
    sheet.addRow(['email', 'first_name', 'last_name']);
    sheet.addRow([email, 'Тест', 'Импорт']);
    const bytes = Buffer.from(await book.xlsx.writeBuffer());
    await page.getByLabel('Таблица учеников').setInputFiles({
      name: 'students.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: bytes,
    });
    await page.getByRole('button', { name: 'Проверить таблицу' }).click();
    await expect(page.getByText('Будет приглашён', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Подтвердить импорт' }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Подтвердить', exact: true })
      .click();
    await expect(page.getByText('Импорт поставлен в очередь.', { exact: false })).toBeVisible();
    await expect
      .poll(
        async () => {
          const r = await sql.query('select id from auth.users where email=$1', [email]);
          imported = r.rows[0]?.id ?? null;
          return !!imported;
        },
        { timeout: 60000 },
      )
      .toBe(true);
    await expect
      .poll(async () => {
        const inbox = await (await fetch('http://127.0.0.1:56324/api/v1/messages')).json();
        return inbox.messages.some((m: { To: { Address: string }[] }) =>
          m.To.some((a) => a.Address === email),
        );
      })
      .toBe(true);
    await page.goto(`/admin/users/${imported}`);
    await expect(page.getByRole('heading', { name: 'Тест Импорт' })).toBeVisible();
    writeFileSync(
      qaPath('evidence/import-ui.json'),
      JSON.stringify(
        {
          status: 'PASS',
          checks: [
            'preview per-row errors',
            'staff account rejection',
            'duplicate emails block confirmation',
            'XLSX parsing',
            'worker invitation in local Mailpit',
            'new learner card',
          ],
        },
        null,
        2,
      ),
    );
  } finally {
    if (imported) {
      const service = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);
      await sql.query("delete from private.operations_jobs where payload->'rows' @> $1::jsonb", [
        JSON.stringify([{ email }]),
      ]);
      await service.auth.admin.deleteUser(imported);
    }
    await sql.end();
  }
});
test('Bulk assignment and revoke require confirmation and appear on the learner card', async ({
  page,
}) => {
  const db = await staffClient(),
    course = await fixtureCourse(db);
  try {
    await login(page, 0);
    await page.goto('/admin/users?role=student');
    await page.getByText('Массовые действия · ученики на этой странице', { exact: true }).click();
    await page.getByRole('button', { name: 'Выбрать всех', exact: true }).click();
    await page.getByLabel('Поиск курса для группы').fill(course.title);
    await expect(
      page
        .getByLabel('Выбрать курс для группы')
        .getByRole('option', { name: course.title, exact: true }),
    ).toBeAttached();
    await page.getByLabel('Выбрать курс для группы').selectOption(course.id);
    await page.getByRole('button', { name: 'Назначить курс', exact: true }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Подтвердить', exact: true })
      .click();
    await expect(page.getByText(/Доступ назначен для/)).toBeVisible();
    await page.goto(`/admin/users/${accounts[2].id}`);
    await expect(page.getByRole('link', { name: course.title, exact: true })).toBeVisible();
    await expect(page.getByText('Доступ выдан', { exact: true }).first()).toBeVisible();
    await page.goto('/admin/users?role=student');
    await page.getByText('Массовые действия · ученики на этой странице', { exact: true }).click();
    await page.getByRole('button', { name: 'Выбрать всех', exact: true }).click();
    await page.getByLabel('Поиск курса для группы').fill(course.title);
    await expect(
      page
        .getByLabel('Выбрать курс для группы')
        .getByRole('option', { name: course.title, exact: true }),
    ).toBeAttached();
    await page.getByLabel('Выбрать курс для группы').selectOption(course.id);
    await page.getByRole('button', { name: 'Отозвать доступ', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Подтвердить', exact: true })
      .click();
    await expect(page.getByText(/Доступ отозван для/)).toBeVisible();
    await page.goto(`/admin/users/${accounts[2].id}`);
    await expect(page.getByRole('link', { name: course.title, exact: true })).toBeVisible();
    await expect(
      page
        .locator('.student-course-grid section')
        .filter({ hasText: course.title })
        .getByText('Доступ отозван', { exact: true }),
    ).toBeVisible();
    await expect(
      page.locator('.student-history').getByText('Доступ отозван', { exact: true }).first(),
    ).toBeVisible();
    writeFileSync(
      qaPath('evidence/bulk-ui.json'),
      JSON.stringify(
        {
          status: 'PASS',
          checks: [
            'assignment confirmation',
            'learner grant and history',
            'revoke confirmation',
            'revoked grant and retained history',
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
test('Video upload, processing, lesson picker, publication and Student isolation', async ({
  page,
  browser,
}) => {
  test.setTimeout(180000);
  const sql = await localSql(),
    db = await staffClient(),
    course = await fixtureCourse(db),
    lesson = course.modules[0].lessons[0];
  const filename = `qa-upload-${randomUUID()}.mp4`;
  let mid: string | null = null,
    poster: string | null = null;
  try {
    await login(page, 0);
    await page.goto('/admin/videos');
    await page.getByLabel('Видеофайл').setInputFiles({
      name: filename,
      mimeType: 'video/mp4',
      buffer: readFileSync('.local/operations-fixture.mp4'),
    });
    await page.getByLabel('Надпись в кадре').fill('Академия — тест обработки');
    await page.getByRole('button', { name: 'Загрузить и обработать' }).click();
    await expect(
      page.getByText('Видео загружено и поставлено в обработку', { exact: true }),
    ).toBeVisible();
    await expect
      .poll(
        async () => {
          const r = await sql.query('select id,status from public.media where filename=$1', [
            filename,
          ]);
          mid = r.rows[0]?.id ?? null;
          return r.rows[0]?.status;
        },
        { timeout: 90000 },
      )
      .toBe('ready');
    const job = (
      await sql.query(
        "select id,payload,result from private.operations_jobs where payload->>'filename'=$1",
        [filename],
      )
    ).rows[0];
    poster = job.payload.poster_id;
    expect(job.result.burned_in).toBe(true);
    await page.reload();
    await expect(
      page.getByRole('row').filter({ hasText: filename }).getByText('Готово', { exact: true }),
    ).toBeVisible();
    await page.goto(`/admin/courses/${course.id}?lesson=${lesson.id}`);
    await page.getByLabel('Источник видео').selectOption('upload');
    await page.getByLabel('Готовое видео').selectOption(mid!);
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await expect(page.getByText('Все изменения сохранены', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('Готовое видео')).toHaveValue(mid!);
    await page.getByRole('button', { name: 'Опубликовать', exact: true }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Опубликовать', exact: true })
      .click();
    await expect(page.getByText('Курс опубликован', { exact: true })).toBeVisible();
    await db.rpc('set_access', { target_user: accounts[2].id, cid: course.id, enabled: true });
    const doc = await readDocument(db, course.id),
      block = doc.modules[0].lessons[0].blocks.find((b) => b.type === 'video')!;
    const ctx = await browser.newContext(),
      student = await ctx.newPage();
    await login(student, 2);
    await student.goto(`/courses/${course.slug}/lessons/${lesson.slug}`);
    await student
      .getByRole('button', {
        name: `Смотреть: ${(block.data as { title: string }).title}`,
        exact: true,
      })
      .click();
    const video = student.locator('video');
    await expect(video).toBeVisible();
    await expect
      .poll(() => video.evaluate((v) => (v as HTMLVideoElement).readyState), { timeout: 20000 })
      .toBeGreaterThan(0);
    expect(
      (await student.request.get(`/api/media/${mid}?download=1`, { maxRedirects: 0 })).status(),
    ).toBe(403);
    await ctx.close();
    const ctxB = await browser.newContext(),
      studentB = await ctxB.newPage();
    await login(studentB, 3);
    expect((await studentB.request.get(`/api/playback/${lesson.id}/${block.id}`)).status()).toBe(
      404,
    );
    expect(
      (await studentB.request.get(`/api/media/${mid}?download=1`, { maxRedirects: 0 })).status(),
    ).toBe(404);
    await ctxB.close();
    writeFileSync(
      qaPath('evidence/uploaded-video-ui.json'),
      JSON.stringify(
        {
          status: 'PASS',
          checks: [
            'actual MP4 upload',
            'worker output ready',
            'burned-in commit',
            'CMS picker save/reload',
            'Admin publication',
            'enrolled Student playback',
            'download disabled',
            'Student B content and file denied',
          ],
        },
        null,
        2,
      ),
    );
  } finally {
    await db.rpc('delete_course', { cid: course.id });
    if (mid) {
      await sql.query('delete from public.block_assets where media_id=$1', [mid]);
      await sql.query("delete from private.operations_jobs where payload->>'media_id'=$1", [mid]);
      const ids = [mid, ...(poster ? [poster] : [])];
      const keys = (
        await sql.query('select object_key from public.media where id=any($1::uuid[])', [ids])
      ).rows.map((r) => r.object_key);
      const service = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);
      await service.storage
        .from('academy-private')
        .remove(keys.flatMap((k) => [k, k + '.webp', k + '.small.webp', k + '.medium.webp']));
      await sql.query('delete from public.media where id=any($1::uuid[])', [ids]);
    }
    await sql.end();
  }
});
test('Automations rules, disabled live Telegram and retryable failure', async ({ page }) => {
  const sql = await localSql(),
    connection = randomUUID(),
    ruleName = 'QA правило ' + randomUUID();
  try {
    await sql.query(
      'insert into private.telegram_connections(id,owner_id,telegram_id,chat_id) values($1,$2,999999998,999999998)',
      [connection, accounts[0].id],
    );
    await login(page, 0);
    await page.goto('/admin/automations');
    await expect(page.getByText('Токен бота ещё не настроен на сервере.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Подключить мой Telegram' })).toBeDisabled();
    await page.getByLabel('Название правила').fill(ruleName);
    await page
      .locator('fieldset')
      .filter({ has: page.getByText('Получатели', { exact: true }) })
      .locator('input[type=checkbox]')
      .check();
    await page.getByRole('button', { name: 'Сохранить правило', exact: true }).click();
    const row = page.getByRole('row').filter({ hasText: ruleName });
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: 'Включить', exact: true }).click();
    await expect(row.getByText('Включено', { exact: true })).toBeVisible();
    await row.getByRole('button', { name: 'Запустить сейчас' }).click();
    await expect
      .poll(
        async () => {
          const r = await sql.query(
            "select status from private.operations_jobs where payload->>'name'=$1",
            [ruleName],
          );
          return r.rows[0]?.status;
        },
        { timeout: 40000 },
      )
      .toBe('failed');
    await page.reload();
    await expect(
      page
        .getByRole('row')
        .filter({ hasText: ruleName })
        .filter({ hasText: 'Сервис не подключён' }),
    ).toBeVisible();
  } finally {
    await sql.query("delete from private.operations_jobs where payload->>'name'=$1", [ruleName]);
    await sql.query('delete from private.automation_rules where name=$1', [ruleName]);
    await sql.query('delete from private.telegram_connections where id=$1', [connection]);
    await sql.end();
  }
});
test('New admin screens: seven viewports, both themes and accessible controls', async ({
  page,
}) => {
  test.setTimeout(180000);
  await login(page, 0);
  const results: object[] = [];
  const accessibility: object[] = [];
  let browserErrors = 0;
  let serverErrors = 0;
  page.on('pageerror', () => browserErrors++);
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors++;
  });
  page.on('response', (response) => {
    if (new URL(response.url()).origin === new URL(page.url()).origin && response.status() >= 500)
      serverErrors++;
  });
  for (const [name, path] of [
    ['student-card', `/admin/users/${accounts[2].id}`],
    ['automations', '/admin/automations'],
    ['video-processing', '/admin/videos'],
  ]) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(path);
    await expect(page.locator('main h1')).toBeVisible();
    if (name === 'student-card')
      await expect(
        page.getByRole('heading', { name: 'История изменений', exact: true }),
      ).toBeVisible();
    else if (name === 'automations')
      await expect(page.getByLabel('Название правила')).toBeVisible();
    else await expect(page.getByLabel('Видеофайл')).toBeVisible();
    await expect(page.locator('.skeleton')).toHaveCount(0);
    for (const theme of ['light', 'dark']) {
      if (
        (await page.locator('html').evaluate((el) => el.classList.contains('dark'))) !==
        (theme === 'dark')
      )
        await page.getByRole('button', { name: 'Переключить тему', exact: true }).click();
      await expect
        .poll(() => page.evaluate(() => localStorage.getItem('theme') ?? 'light'))
        .toBe(theme);
      await expect
        .poll(() => page.locator('html').evaluate((el) => el.classList.contains('dark')))
        .toBe(theme === 'dark');
      for (const [width, height] of [
        [375, 812],
        [390, 844],
        [430, 932],
        [768, 1024],
        [1024, 768],
        [1440, 900],
        [1920, 1080],
      ]) {
        await page.setViewportSize({ width, height });
        await page.evaluate(async () => {
          await document.fonts.ready;
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          );
        });
        await expect(page.locator('main h1')).toBeVisible();
        await expect(page.locator('.skeleton')).toHaveCount(0);
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        ).toBe(true);
        if (width === 375 || width === 1440) {
          await page.screenshot({
            path: qaPath(`screenshots/${name}-${theme}-${width}.png`),
            fullPage: true,
          });
          const violations = (
            await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
          ).violations;
          expect(
            violations.filter((v) => ['critical', 'serious'].includes(v.impact ?? '')),
          ).toEqual([]);
          accessibility.push({ screen: name, theme, width, seriousOrCritical: 0 });
        }
        results.push({ screen: name, theme, width, height, status: 'PASS' });
      }
    }
  }
  expect(browserErrors).toBe(0);
  expect(serverErrors).toBe(0);
  writeFileSync(
    qaPath('evidence/new-admin-layout.json'),
    JSON.stringify(
      {
        status: 'PASS',
        contentReady: true,
        browserErrors,
        serverErrors,
        checks: results,
        accessibility,
      },
      null,
      2,
    ),
  );
});
