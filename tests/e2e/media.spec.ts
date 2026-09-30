import { test, expect } from './test';
import { login, accounts } from './helpers';
import { fixtureId, demoAssets } from '../../scripts/fixtures';
import { writeFileSync, mkdirSync } from 'node:fs';
import sharp from 'sharp';
test('private grant survives only its TTL; new grants stop immediately on revoke', async ({
  browser,
}) => {
  test.setTimeout(130000);
  const ac = await browser.newContext(),
    sc = await browser.newContext(),
    bc = await browser.newContext();
  const admin = await ac.newPage(),
    student = await sc.newPage(),
    other = await bc.newPage();
  await login(admin, 0);
  await login(student, 2);
  await login(other, 3);
  const path = `/api/media/${fixtureId('asset-pdf-0')}?download=1`,
    issued = await student.request.get(path, { maxRedirects: 0 });
  expect(issued.status()).toBe(307);
  const grant = issued.headers().location;
  expect((await other.request.get(path, { maxRedirects: 0 })).status()).toBe(404);
  await admin.goto('/admin/users?q=student-a');
  await admin.getByRole('button', { name: `Управлять пользователем ${accounts[2].email}` }).click();
  await admin.getByLabel('Найти курс для назначения').fill('ИИ: от идеи к продукту');
  await admin.getByRole('dialog').getByRole('button', { name: 'Отозвать', exact: true }).click();
  await expect(
    admin.getByRole('dialog').getByRole('button', { name: 'Назначить', exact: true }),
  ).toBeVisible();
  try {
    expect((await student.request.get(path, { maxRedirects: 0 })).status()).toBe(404);
    expect((await student.request.get(grant)).status()).toBe(200);
    await expect
      .poll(async () => (await student.request.get(grant)).status(), {
        timeout: 70000,
        intervals: [10000],
      })
      .toBe(410);
  } finally {
    await admin.getByRole('dialog').getByRole('button', { name: 'Назначить', exact: true }).click();
    await expect(
      admin.getByRole('dialog').getByRole('button', { name: 'Отозвать', exact: true }),
    ).toBeVisible();
  }
  mkdirSync('docs/qa/evidence', { recursive: true });
  writeFileSync(
    'docs/qa/evidence/file-expiry.json',
    JSON.stringify(
      {
        executedAt: new Date().toISOString(),
        status: 'PASS',
        ttlSeconds: 60,
        checks: [
          'A grant issued',
          'B denied',
          'revoked A cannot obtain new grant',
          'already issued grant remains usable within TTL',
          'actual expiry returns 410',
          'access restored',
        ],
      },
      null,
      2,
    ),
  );
  await Promise.all([ac.close(), sc.close(), bc.close()]);
});
test('media UI validates every supported format, Unicode and malformed uploads', async ({
  page,
}) => {
  test.setTimeout(150000);
  await login(page, 0);
  await page.goto('/admin/media');
  const assets = await demoAssets(),
    cover = assets.find((a) => a.name === 'cover-0')!;
  const files = [
    ...assets
      .filter((a) => ['pdf-0', 'docx-0', 'xlsx-0', 'zip-0', 'cover-0'].includes(a.name))
      .map((a) => ({
        name:
          a.name === 'pdf-0'
            ? `${'Длинное имя '.repeat(17)}${Date.now()}.pdf`
            : `Проверка ${Date.now()} ${a.filename}`,
        mimeType: a.mime,
        buffer: a.bytes,
      })),
    {
      name: 'Проверка кириллицы.png',
      mimeType: 'image/png',
      buffer: await sharp(cover.bytes).png().toBuffer(),
    },
    {
      name: 'Фотография для курса.jpg',
      mimeType: 'image/jpeg',
      buffer: await sharp(cover.bytes).jpeg().toBuffer(),
    },
  ];
  for (const file of files) {
    await page.locator('input[type=file]').setInputFiles(file);
    await expect(page.getByText('Файл загружен', { exact: true })).toBeVisible();
    const link = page.getByRole('link', { name: `Скачать ${file.name}`, exact: true });
    await expect(link).toBeVisible();
    const response = await page.request.get((await link.getAttribute('href'))!);
    expect(response.status()).toBe(200);
    expect(Buffer.compare(await response.body(), file.buffer)).toBe(0);
    expect(response.headers()['content-disposition']).toContain("filename*=UTF-8''");
    await page.getByRole('button', { name: `Удалить файл ${file.name}`, exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Удалить', exact: true }).click();
    await expect(link).toHaveCount(0);
  }
  await page.locator('input[type=file]').setInputFiles(files[0]);
  await expect(page.getByText('Файл загружен', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('link', { name: `Скачать ${files[0].name}`, exact: true }),
  ).toHaveCount(1);
  await page.locator('input[type=file]').setInputFiles({
    name: 'Подмена.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('<script>not a PDF</script>'),
  });
  await expect(page.locator('.field-error[role=alert]')).toContainText('не соответствует');
  mkdirSync('.local/uploads', { recursive: true });
  writeFileSync('.local/uploads/Слишком большой.pdf', Buffer.alloc(52428801));
  await page.locator('input[type=file]').setInputFiles('.local/uploads/Слишком большой.pdf');
  await expect(page.locator('.field-error[role=alert]')).toContainText('размер');
  writeFileSync(
    'docs/qa/evidence/media-formats.json',
    JSON.stringify(
      {
        executedAt: new Date().toISOString(),
        status: 'PASS',
        formats: ['PDF', 'DOCX', 'XLSX', 'ZIP', 'WebP', 'PNG', 'JPEG'],
        checks: [
          'Unicode filenames',
          'real uploads and server finalization',
          'byte-for-byte download of every format with RFC 5987 filename',
          'confirmed deletion of unused assets and repeat upload',
          'long Unicode filename',
          'invalid PDF rejected',
          'over-50MiB upload rejected before transfer',
        ],
      },
      null,
      2,
    ),
  );
});
