import { test, expect } from './test';
import { login, accounts } from './helpers';
import { staffClient, document } from './db-fixtures';
import { writeFileSync } from 'node:fs';
import { qaPath } from '../../scripts/qa-paths.mjs';
import type { PlaybackGrant } from '../../src/lib/video';
test.use({ screenshot: 'off', trace: 'off', video: 'off' });

for (const provider of ['cloudflare', 'mux'] as const) {
  test(`external protected ${provider}: CMS, A playback, B denied, revoke and token expiry`, async ({
    browser,
  }) => {
    const source =
      process.env[provider === 'cloudflare' ? 'QA_CLOUDFLARE_VIDEO_ID' : 'QA_MUX_PLAYBACK_ID'];
    const configured =
      !!process.env[
        provider === 'cloudflare' ? 'CLOUDFLARE_STREAM_SIGNING_KEY' : 'MUX_SIGNING_PRIVATE_KEY'
      ];
    test.skip(
      !configured || !source,
      'SKIP_EXTERNAL_CONFIGURATION: real provider credentials and a private QA asset are required',
    );
    test.setTimeout(360000);
    const contexts = await Promise.all([
      browser.newContext(),
      browser.newContext(),
      browser.newContext(),
    ]);
    const [admin, student, other] = await Promise.all(contexts.map((c) => c.newPage()));
    const db = await staffClient();
    let id: string | undefined,
      status = 'FAIL';
    try {
      await login(admin, 0);
      await admin.goto('/admin/courses/new');
      await admin
        .getByLabel('Название курса', { exact: true })
        .fill(`Protected ${provider} QA ${Date.now()}`);
      await admin.getByRole('tab', { name: 'Модули', exact: true }).click();
      await admin.getByRole('button', { name: 'Первый модуль' }).click();
      await admin.getByRole('button', { name: 'Добавить урок', exact: true }).click();
      await admin
        .getByRole('textbox', { name: 'Текст урока' })
        .fill('Private provider QA test asset.');
      await admin
        .locator('.block-palette')
        .getByRole('button', { name: 'Видео', exact: true })
        .click();
      await admin.getByLabel('Источник видео', { exact: true }).selectOption(provider);
      await admin.getByLabel('Идентификатор защищённого видео').fill(source!);
      await admin.getByRole('button', { name: 'Сохранить', exact: true }).click();
      await expect(admin.getByText('Все изменения сохранены', { exact: true })).toBeVisible();
      id = admin.url().split('/courses/')[1].split('?')[0];
      const doc = await document(db, id),
        lesson = doc.modules[0].lessons[0],
        block = lesson.blocks.find((b) => b.type === 'video')!;
      await admin.getByRole('button', { name: 'Опубликовать', exact: true }).click();
      await admin
        .getByRole('dialog')
        .getByRole('button', { name: 'Опубликовать', exact: true })
        .click();
      await expect(admin.getByText('Курс опубликован', { exact: true })).toBeVisible();
      expect(
        (await db.rpc('set_access', { cid: id, target_user: accounts[2].id, enabled: true }))
          .error === null,
      ).toBe(true);
      await Promise.all([login(student, 2), login(other, 3)]);
      const endpoint = `/api/playback/${lesson.id}/${block.id}`;
      const received = student.waitForResponse(
        (r) => r.url().includes(endpoint) && r.status() === 200,
      );
      await student.goto(`/courses/${doc.slug}/lessons/${lesson.slug}`);
      const grant = (await (await received).json()) as PlaybackGrant;
      expect(grant.protected && !!grant.expiresAt).toBe(true);
      await student.getByRole('button', { name: 'Смотреть: Видео к уроку', exact: true }).click();
      const video = student.frameLocator('.video-frame iframe').locator('video').first();
      await expect(video).toBeAttached({ timeout: 45000 });
      await video.evaluate(async (el) => {
        const v = el as HTMLVideoElement;
        v.muted = true;
        await v.play();
      });
      await expect
        .poll(() => video.evaluate((el) => (el as HTMLVideoElement).currentTime), {
          timeout: 45000,
        })
        .toBeGreaterThan(2);
      expect((await other.request.get(endpoint)).status()).toBe(404);
      expect(
        (await db.rpc('set_access', { cid: id, target_user: accounts[2].id, enabled: false }))
          .error === null,
      ).toBe(true);
      expect((await student.request.get(endpoint)).status()).toBe(404);
      // Stop automatic renewal. Existing bearer grants remain valid only until TTL.
      await student.goto('/dashboard');
      const untilExpiry = Date.parse(grant.expiresAt!) - Date.now() + 5000;
      if (untilExpiry > 0) await new Promise((resolve) => setTimeout(resolve, untilExpiry));
      const iframe = new URL(grant.url);
      const manifest =
        provider === 'cloudflare'
          ? `${iframe.origin}/${iframe.pathname.split('/')[1]}/manifest/video.m3u8`
          : `https://stream.mux.com/${source}.m3u8?token=${encodeURIComponent(iframe.searchParams.get('playback-token')!)}`;
      // Avoid assertion output containing the bearer URL; persist only the status.
      const expiredStatus = await student.request
        .get(manifest)
        .then((response) => response.status())
        .catch(() => 0);
      expect(expiredStatus === 401 || expiredStatus === 403).toBe(true);
      status = 'PASS';
    } finally {
      if (id) await db.rpc('delete_course', { cid: id });
      await Promise.all(contexts.map((c) => c.close()));
      writeFileSync(
        qaPath(`evidence/protected-${provider}.json`),
        JSON.stringify(
          {
            provider,
            status,
            executedAt: new Date().toISOString(),
            scope: 'external live playback, denial, revoke and expired manifest',
          },
          null,
          2,
        ),
      );
    }
  });
}
