import { qaPath } from '../../scripts/qa-paths.mjs';
import { test, expect, type Page } from './test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { login, accounts } from './helpers';
import { demoAssets } from '../../scripts/fixtures';
import { staffClient, document as readDocument } from './db-fixtures';
const block = (page: Page, label: string) =>
  page.locator('.block-panel').filter({
    has: page.locator('.block-panel-header>span').filter({ hasText: new RegExp(` / ${label}$`) }),
  });
async function verifyRenderedBlocks(page: Page) {
  await expect(page.locator('.lesson-content > *')).toHaveCount(11);
  await expect(page.getByRole('heading', { name: 'Проверьте себя', exact: true })).toBeVisible();
  await expect(page.locator('.rich-content')).toContainText('UAT: выберите задачу');
  await expect(page.locator('.video-block')).toBeVisible();
  await expect(page.locator('.lesson-file')).toContainText('План практики UAT');
  await expect(page.locator('.lesson-link')).toHaveAttribute('href', 'https://www.wikipedia.org/');
  await expect(page.locator('.lesson-quote')).toContainText(
    'Ясность начинается с правильного вопроса.',
  );
  await expect(page.locator('.lesson-callout')).toContainText('Запишите результат эксперимента');
  await expect(page.locator('.lesson-content > hr')).toHaveCount(1);
  await expect(page.locator('.code-block code')).toHaveText('Вопрос → Гипотеза → Проверка → Вывод');
  await expect(page.locator('.lesson-gallery img')).toHaveAttribute('alt', 'Обложка программы');
  await expect(page.locator('.lesson-content > .lesson-figure img')).toHaveAttribute(
    'alt',
    'Сфера и орбиты — визуальная метафора исследования',
  );
}
test('UAT: Admin builds, publishes and assigns; Student learns; Editor draft stays private', async ({
  browser,
}) => {
  test.setTimeout(240000);
  mkdirSync('.local/uploads', { recursive: true });
  const assets = await demoAssets();
  const imageAsset = assets.find((a) => a.name === 'cover-0')!,
    pdf = assets.find((a) => a.name === 'pdf-0')!;
  const imagePath = resolve('.local/uploads/Изображение для UAT.webp'),
    pdfPath = resolve('.local/uploads/План практики UAT.pdf');
  writeFileSync(imagePath, imageAsset.bytes);
  writeFileSync(pdfPath, pdf.bytes);
  const adminContext = await browser.newContext(),
    studentContext = await browser.newContext(),
    otherContext = await browser.newContext(),
    editorContext = await browser.newContext();
  const admin = await adminContext.newPage(),
    student = await studentContext.newPage(),
    other = await otherContext.newPage(),
    editor = await editorContext.newPage();
  const stamp = Date.now().toString(36),
    title = `Практика осмысленного обучения ${stamp}`,
    slug = `practice-${stamp}`;
  const db = await staffClient();
  await login(admin, 0);
  await admin.getByRole('link', { name: 'Создать курс', exact: true }).dblclick();
  await admin.getByLabel('Название курса', { exact: true }).fill(title);
  await admin
    .getByLabel('Короткое описание', { exact: true })
    .fill('Новая программа, полностью собранная через интерфейс администратора.');
  await admin
    .getByLabel('Полное описание', { exact: true })
    .fill('Два практических шага от гипотезы к результату.');
  await admin.getByLabel('Автор', { exact: true }).fill('Команда Академии');
  await admin
    .getByLabel('Категория', { exact: true })
    .selectOption({ label: 'Продукт и стратегия' });
  await admin.getByLabel('Теги', { exact: true }).fill('Практика, Исследование');
  await admin.locator('input[type=file]').setInputFiles(imagePath);
  await expect(admin.getByText('Файл загружен', { exact: true })).toBeVisible();
  await admin.getByRole('tab', { name: 'Настройки', exact: true }).click();
  await admin.getByLabel('Адрес курса', { exact: true }).fill(slug);
  await admin.getByRole('tab', { name: 'Модули', exact: true }).click();
  await admin.getByRole('button', { name: 'Первый модуль' }).click();
  await admin.getByLabel('Название модуля').fill('От вопроса к действию');
  await admin.getByRole('button', { name: 'Добавить урок', exact: true }).click();
  await admin.getByLabel('Название урока', { exact: true }).fill('Сформулируйте свою гипотезу');
  await admin.getByLabel('Адрес урока', { exact: true }).fill('hypothesis');
  await admin
    .getByRole('textbox', { name: 'Текст урока' })
    .fill(
      'UAT: выберите задачу, которую вы хотите решить. Сформулируйте проверяемую гипотезу и критерий успеха.',
    );
  const add = async (label: string) =>
    admin.locator('.block-palette').getByRole('button', { name: label, exact: true }).click();
  await add('Видео');
  await block(admin, 'Видео').getByLabel('Источник видео', { exact: true }).selectOption('direct');
  await block(admin, 'Видео')
    .getByLabel('Адрес видео', { exact: true })
    .fill('https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4');
  await add('Изображение');
  await block(admin, 'Изображение').locator('input[type=file]').setInputFiles(imagePath);
  await expect(
    block(admin, 'Изображение').getByText('Файл загружен', { exact: true }),
  ).toBeVisible();
  await block(admin, 'Изображение')
    .getByLabel('Альтернативный текст')
    .fill('Сфера и орбиты — визуальная метафора исследования');
  await add('Файл');
  await block(admin, 'Файл').locator('input[type=file]').setInputFiles(pdfPath);
  await expect(block(admin, 'Файл').getByText('Файл загружен', { exact: true })).toBeVisible();
  await block(admin, 'Файл').getByLabel('Название материала').fill('План практики UAT');
  await add('Заголовок');
  await block(admin, 'Заголовок').getByLabel('Текст заголовка').fill('Проверьте себя');
  await add('Ссылка');
  await block(admin, 'Ссылка').getByLabel('HTTPS-адрес').fill('https://www.wikipedia.org/');
  await block(admin, 'Ссылка').getByLabel('Название ссылки').fill('Дополнительное чтение');
  await add('Цитата');
  await block(admin, 'Цитата')
    .getByLabel('Цитата', { exact: true })
    .fill('Ясность начинается с правильного вопроса.');
  await block(admin, 'Цитата').getByLabel('Автор', { exact: true }).fill('Команда Академии');
  await add('Акцент');
  await block(admin, 'Акцент')
    .getByLabel('Текст акцента')
    .fill('Запишите результат эксперимента, даже если он не подтвердит гипотезу.');
  await add('Разделитель');
  await add('Код');
  await block(admin, 'Код')
    .getByLabel('Код', { exact: true })
    .fill('Вопрос → Гипотеза → Проверка → Вывод');
  await add('Галерея');
  await block(admin, 'Галерея').getByRole('button', { name: 'Добавить изображение' }).click();
  await block(admin, 'Галерея')
    .getByLabel('Изображение из медиатеки')
    .selectOption({ label: 'Обложка-1.webp' });
  await block(admin, 'Галерея').getByLabel('Описание изображения 1').fill('Обложка программы');
  await admin.getByRole('button', { name: 'Сохранить', exact: true }).dblclick();
  await expect(admin.getByText('Все изменения сохранены', { exact: true })).toBeVisible();
  const courseId = admin.url().split('/courses/')[1].split('?')[0];
  const savedLesson = (await readDocument(db, courseId)).modules[0].lessons[0];
  expect(savedLesson.blocks.map((b) => b.type).sort()).toEqual(
    [
      'heading',
      'rich_text',
      'image',
      'video',
      'file',
      'link',
      'quote',
      'callout',
      'divider',
      'code',
      'gallery',
    ].sort(),
  );
  await admin.goto(`/admin/courses/${courseId}?lesson=${savedLesson.id}`);
  await expect(admin.locator('.block-panel')).toHaveCount(11);
  expect((await readDocument(db, courseId)).modules[0].lessons[0].blocks).toEqual(
    savedLesson.blocks,
  );
  await expect(block(admin, 'Заголовок').getByLabel('Текст заголовка')).toHaveValue(
    'Проверьте себя',
  );
  await expect(block(admin, 'Видео').getByLabel('Источник видео', { exact: true })).toHaveValue(
    'direct',
  );
  await expect(block(admin, 'Файл').getByLabel('Название материала')).toHaveValue(
    'План практики UAT',
  );
  await expect(block(admin, 'Код').getByLabel('Код', { exact: true })).toHaveValue(
    'Вопрос → Гипотеза → Проверка → Вывод',
  );
  await admin.getByRole('button', { name: 'Предпросмотр', exact: true }).click();
  await verifyRenderedBlocks(admin);
  await admin.goto(`/admin/courses/${courseId}?lesson=${savedLesson.id}`);
  await admin.getByRole('tab', { name: 'Модули', exact: true }).click();
  await admin.getByRole('button', { name: 'Добавить урок', exact: true }).click();
  await admin.getByLabel('Название урока', { exact: true }).fill('Следующий шаг');
  await admin.getByLabel('Адрес урока', { exact: true }).fill('next-step');
  await admin
    .getByRole('textbox', { name: 'Текст урока' })
    .fill('UAT: теперь запланируйте небольшой эксперимент и назначьте дату проверки результата.');
  await admin.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(admin.getByText('Все изменения сохранены', { exact: true })).toBeVisible();
  await admin.getByRole('button', { name: 'Опубликовать', exact: true }).click();
  await admin
    .getByRole('dialog')
    .getByRole('button', { name: 'Опубликовать', exact: true })
    .dblclick();
  await expect(admin.getByText('Курс опубликован', { exact: true })).toBeVisible();
  const courses = await db.from('courses').select('id').eq('slug', slug);
  expect(courses.error).toBeNull();
  expect(courses.data).toHaveLength(1);
  const publications = await db
    .from('audit_logs')
    .select('id')
    .eq('entity_id', courseId)
    .eq('action', 'course.publish');
  expect(publications.error).toBeNull();
  expect(publications.data).toHaveLength(1);
  await admin.goto('/admin/users?q=student-a');
  await admin.getByRole('button', { name: `Управлять пользователем ${accounts[2].email}` }).click();
  await admin.getByLabel('Найти курс для назначения').fill(title);
  await admin.getByRole('dialog').getByRole('button', { name: 'Назначить', exact: true }).click();
  await expect(
    admin.getByRole('dialog').getByRole('button', { name: 'Отозвать', exact: true }),
  ).toBeVisible();
  await login(student, 2);
  await student.goto(`/courses/${slug}/lessons/hypothesis`);
  await expect(
    student.getByRole('heading', { name: 'Сформулируйте свою гипотезу', exact: true }),
  ).toBeVisible();
  await expect(student.getByText('UAT: выберите задачу', { exact: false })).toBeVisible();
  await verifyRenderedBlocks(student);
  await student.getByRole('button', { name: 'Смотреть: Видео к уроку', exact: true }).click();
  await student.locator('video').evaluate(async (video: HTMLVideoElement) => {
    video.muted = true;
    await Promise.race([
      video.play(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('UAT video did not start')), 15000),
      ),
    ]);
  });
  await expect
    .poll(() => student.locator('video').evaluate((video: HTMLVideoElement) => video.currentTime))
    .toBeGreaterThan(0);
  await expect
    .poll(() =>
      student
        .locator('.lesson-figure img')
        .first()
        .evaluate((image: HTMLImageElement) => image.naturalWidth),
    )
    .toBeGreaterThan(0);
  const downloadLink = student.getByRole('link', {
    name: 'План практики UAT Материал к уроку · скачать файл',
  });
  const privateHref = await downloadLink.getAttribute('href');
  expect(privateHref).toBeTruthy();
  const downloaded = student.waitForEvent('download');
  await downloadLink.click();
  const file = await downloaded;
  expect(file.suggestedFilename()).toBe('План практики UAT.pdf');
  await file.saveAs(resolve('.local/uploads/Проверенное скачивание.pdf'));
  await student.getByRole('button', { name: 'Завершить урок', exact: true }).dblclick();
  await expect(student.getByRole('button', { name: 'Урок завершён', exact: true })).toBeDisabled();
  const progress = await db
    .from('progress')
    .select('completed_at')
    .eq('user_id', accounts[2].id)
    .eq('lesson_id', savedLesson.id);
  expect(progress.error).toBeNull();
  expect(progress.data).toHaveLength(1);
  expect(progress.data?.[0].completed_at).toBeTruthy();
  await student.goto('/profile');
  await student.getByRole('button', { name: 'Выйти из аккаунта' }).click();
  await login(student, 2);
  await student.getByRole('link', { name: 'Продолжить обучение' }).click();
  await expect(student.getByRole('heading', { name: 'Следующий шаг', exact: true })).toBeVisible();
  await login(other, 3);
  await other.goto(`/courses/${slug}/lessons/hypothesis`);
  await expect(other.getByRole('heading', { name: 'Страница недоступна' })).toBeVisible();
  expect((await other.request.get(privateHref!, { maxRedirects: 0 })).status()).toBe(404);
  await login(editor, 1);
  await editor.goto(`/admin/courses/${courseId}`);
  await editor.getByRole('tab', { name: 'Уроки', exact: true }).click();
  await expect(editor.getByRole('button', { name: 'Опубликовать', exact: true })).toHaveCount(0);
  await editor
    .getByRole('textbox', { name: 'Текст урока' })
    .fill('СЕКРЕТНЫЙ ЧЕРНОВИК РЕДАКТОРА UAT');
  await editor.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(editor.getByText('Все изменения сохранены', { exact: true })).toBeVisible();
  await student.goto(`/courses/${slug}/lessons/hypothesis`);
  await expect(student.getByText('СЕКРЕТНЫЙ ЧЕРНОВИК РЕДАКТОРА UAT', { exact: true })).toHaveCount(
    0,
  );
  await expect(student.getByText('UAT: выберите задачу', { exact: false })).toBeVisible();
  writeFileSync(
    qaPath('evidence/uat.json'),
    JSON.stringify(
      {
        executedAt: new Date().toISOString(),
        status: 'PASS',
        courseId,
        slug,
        scenarios: [
          'Admin UI creates all 11 block types',
          'all 11 blocks survive reload, exact database roundtrip, preview and Student render',
          'double-click Create, Save, Publish and Complete creates one course/publication/progress',
          'real image and PDF upload',
          'real direct video playback and decoded lesson image',
          'publish and enroll through UI',
          'Student A download and completion',
          'logout/login and resume next lesson',
          'Student B denied page and file route',
          'Editor draft invisible until Admin publication',
        ],
      },
      null,
      2,
    ),
  );
  await Promise.all([
    adminContext.close(),
    studentContext.close(),
    otherContext.close(),
    editorContext.close(),
  ]);
});
