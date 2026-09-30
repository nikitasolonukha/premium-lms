import { writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { test, expect } from './test';
import { login, accounts } from './helpers';
import { staffClient, fixtureCourse, document as courseDocument } from './db-fixtures';
import { qaPath } from '../../scripts/qa-paths.mjs';

test.use({ channel: 'chrome', headless: false });

// Player overlay QA using a public CC0 sample. This does not prove burned-in
// watermarking, protected provider playback, or protection of downloaded bytes.
test('owner name and viewer watermark: mobile, desktop, themes and video fullscreen', async ({
  browser,
}) => {
  test.setTimeout(120000);
  const db = await staffClient();
  const course = await fixtureCourse(db);
  const original = (await db.from('settings').select('config').single()).data!.config;
  const brand = 'Школа заказчика — практика';
  const lesson = course.modules[0].lessons[0];
  lesson.blocks = [
    {
      id: randomUUID(),
      version: 1,
      type: 'video',
      data: {
        provider: 'direct',
        title: 'Тест надписи поверх видео',
        url: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
      },
    },
  ];
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    expect(
      (await db.rpc('save_course', { doc: course, expected_version: course.version })).error,
    ).toBeNull();
    const saved = await courseDocument(db, course.id);
    expect(
      (await db.rpc('publish_course', { cid: course.id, expected_version: saved.version })).error,
    ).toBeNull();
    expect(
      (await db.rpc('set_access', { cid: course.id, target_user: accounts[2].id, enabled: true }))
        .error,
    ).toBeNull();
    expect(
      (
        await db.rpc('update_settings', {
          doc: {
            ...original,
            brand_name: brand,
            content_watermark_enabled: true,
            watermark_mode: 'user_id',
            watermark_interval_seconds: 5,
            watermark_opacity: 0.65,
          },
        })
      ).error,
    ).toBeNull();
    await login(page, 2);
    await page.clock.install();
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => localStorage.setItem('theme', value), theme);
      for (const viewport of [
        { width: 390, height: 844 },
        { width: 1440, height: 900 },
      ]) {
        await page.setViewportSize(viewport);
        await page.goto(`/courses/${course.slug}/lessons/${lesson.slug}`);
        const frame = page.locator('.video-frame');
        await expect(frame).toHaveCount(1);
        await expect(page.locator('html')).toHaveClass(new RegExp(theme));
        await expect(frame.locator('.watermark-brand')).toHaveText(brand);
        await expect(frame.locator('.watermark-viewer')).toHaveText(accounts[2].id.slice(0, 8));
        await expect(frame.locator('.watermark')).not.toContainText(accounts[2].email);
        await frame.getByRole('button', { name: 'Смотреть: Тест надписи поверх видео' }).click();
        const video = frame.locator('video');
        await expect(video).toBeVisible();
        await expect(video).toHaveAttribute(
          'controlslist',
          'nodownload nofullscreen noremoteplayback',
        );
        await expect(video).toHaveJSProperty('disablePictureInPicture', true);
        await expect(video).toHaveJSProperty('disableRemotePlayback', true);
        await video.evaluate((element) => (element as HTMLVideoElement).play());
        await expect
          .poll(() => video.evaluate((element) => (element as HTMLVideoElement).currentTime))
          .toBeGreaterThan(0);
        for (let position = 0; position < 4; position++) {
          await expect(frame.locator('.watermark')).toHaveClass(
            new RegExp(`watermark-${position}`),
          );
          // Let the 300 ms CSS transition settle before testing its resting position.
          await expect
            .poll(
              async () => {
                const mark = await frame.locator('.watermark').boundingBox();
                const control = await frame
                  .getByRole('button', { name: 'Развернуть плеер с водяным знаком' })
                  .boundingBox();
                return Boolean(
                  mark &&
                  control &&
                  mark.x < control.x + control.width &&
                  mark.x + mark.width > control.x &&
                  mark.y < control.y + control.height &&
                  mark.y + mark.height > control.y,
                );
              },
              { message: `watermark ${position}, ${theme}, ${viewport.width}` },
            )
            .toBe(false);
          if (position < 3) await page.clock.fastForward(5000);
        }
        await frame.getByRole('button', { name: 'Развернуть плеер с водяным знаком' }).click();
        await expect
          .poll(() => page.evaluate(() => document.fullscreenElement?.className))
          .toContain('video-frame');
        await expect(frame.locator('.watermark-brand')).toBeVisible();
        await expect(frame.locator('.watermark-viewer')).toBeVisible();
        // A phone photo cropped to the video must still include the overlay:
        // the label belongs inside the decoded picture, not its black letterbox.
        await expect
          .poll(async () => {
            const videoBox = await video.boundingBox();
            const mark = await frame.locator('.watermark').boundingBox();
            const ratio = await video.evaluate((element) => {
              const video = element as HTMLVideoElement;
              return video.videoWidth / video.videoHeight;
            });
            if (!videoBox || !mark || !Number.isFinite(ratio)) return false;
            const width = Math.min(videoBox.width, videoBox.height * ratio);
            const height = width / ratio;
            const left = videoBox.x + (videoBox.width - width) / 2;
            const top = videoBox.y + (videoBox.height - height) / 2;
            return (
              mark.x >= left - 1 &&
              mark.x + mark.width <= left + width + 1 &&
              mark.y >= top - 1 &&
              mark.y + mark.height <= top + height + 1
            );
          })
          .toBe(true);
        await page.screenshot({
          path: qaPath(`screenshots/owner-watermark-${viewport.width}-${theme}.png`),
        });
        await page.evaluate(() => document.exitFullscreen());
      }
    }
    writeFileSync(
      qaPath('evidence/owner-watermark.json'),
      JSON.stringify(
        {
          status: 'PASS',
          executedAt: new Date().toISOString(),
          scope:
            'DOM overlay and player controls only; no burned-in output or download-byte protection implemented or claimed',
          checks: [
            'academy name + short viewer ID',
            'public CC0 sample actually starts playback; not a customer/protected source',
            'no full email in overlay',
            'four positions clear of expand control',
            '390x844 and 1440x900 in both themes',
            'LMS video fullscreen retains both labels',
            'fullscreen label lies inside actual decoded video bounds, including mobile letterboxing',
            'native PiP/remote/fullscreen hints configured when watermark enabled',
          ],
        },
        null,
        2,
      ),
    );
  } finally {
    await db.rpc('update_settings', { doc: original });
    await db.rpc('delete_course', { cid: course.id });
    await context.close();
  }
});
