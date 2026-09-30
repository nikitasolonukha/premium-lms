import { qaPath } from '../../scripts/qa-paths.mjs';
import { test, expect } from './test';
import { writeFileSync } from 'node:fs';
import { login } from './helpers';
import { staffClient } from './db-fixtures';
import { demoAssets } from '../../scripts/fixtures';

test('repeated upload selection while the request is pending creates one asset', async ({
  page,
}) => {
  const db = await staffClient();
  const name = `Повторная загрузка-${Date.now()}.pdf`;
  const pdf = (await demoAssets()).find((a) => a.name === 'pdf-0')!;
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started = 0;
  let storagePuts = 0;
  page.on('request', (request) => {
    if (
      request.method() === 'PUT' &&
      new URL(request.url()).pathname.includes('/storage/v1/object/')
    )
      storagePuts++;
  });
  try {
    await login(page, 0);
    await page.goto('/admin/media');
    // Hold transport only: the real Server Action, Storage and DB still execute.
    await page.route('**/admin/media*', async (route) => {
      if (route.request().method() === 'POST') {
        started++;
        await gate;
      }
      await route.continue();
    });
    page.on('filechooser', () => {});
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page
        .getByRole('button', { name: 'Загрузить файл', exact: true })
        .and(page.locator('button'))
        .dblclick(),
    ]);
    await chooser.setFiles({ name, mimeType: 'application/pdf', buffer: pdf.bytes });
    await expect.poll(() => started).toBeGreaterThan(0);
    const input = page.locator('input[type=file]');
    await expect(input).toBeDisabled();
    // Re-delivery of the same change event must not start another upload intent.
    await input.dispatchEvent('change');
    release();
    await expect(page.getByText('Файл загружен', { exact: true })).toBeVisible();
    await page.waitForLoadState('networkidle');
    const rows = await db.from('media').select('id,status').eq('filename', name);
    expect(rows.error).toBeNull();
    expect(rows.data).toHaveLength(1);
    expect(rows.data?.[0].status).toBe('ready');
    expect(storagePuts).toBe(1);
    writeFileSync(
      qaPath('evidence/repeat-upload.json'),
      JSON.stringify(
        {
          executedAt: new Date().toISOString(),
          status: 'PASS',
          readyRows: rows.data?.length,
          storagePuts,
          checks: [
            'double-click upload chooser',
            'input disabled in flight',
            'duplicate change event while first request pending',
            'exactly one ready media row and storage upload',
          ],
        },
        null,
        2,
      ),
    );
  } finally {
    release();
    await page.unroute('**/admin/media*');
    const rows = await db.from('media').select('id').eq('filename', name);
    for (const row of rows.data ?? []) await db.rpc('delete_media', { mid: row.id });
  }
});
