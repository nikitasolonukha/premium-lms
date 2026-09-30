import { qaPath } from '../../scripts/qa-paths.mjs';
import { test, expect } from './test';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { login, accounts } from './helpers';
import { staffClient, fixtureCourse } from './db-fixtures';
import type { LessonBlock } from '../../src/lib/schemas';
// The provider's demo may require Widevine. Installed Chrome supports it in
// headed mode; headless Chrome reported NotSupportedError on this QA host.
// Keep component updates available in the isolated test browser profile.
test.use({
  channel: 'chrome',
  headless: false,
  launchOptions: { ignoreDefaultArgs: ['--disable-component-update'] },
});
test('five public video adapters: grants, real player loading, playback, mobile and fullscreen', async ({
  browser,
}) => {
  test.setTimeout(300000);
  const db = await staffClient(),
    course = await fixtureCourse(db),
    original = (await db.from('settings').select('config').single()).data!.config;
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } }),
    page = await context.newPage();
  const providers = [
    {
      provider: 'youtube',
      url: process.env.QA_YOUTUBE_URL ?? 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
    },
    {
      provider: 'vimeo',
      url: process.env.QA_VIMEO_URL ?? 'https://player.vimeo.com/video/76979871?h=8272103f6e',
    },
    {
      provider: 'rutube',
      url:
        process.env.QA_RUTUBE_URL ??
        'https://rutube.ru/play/embed/caafe83ff1c6ed38d394635b83ece578/?p=IBgzQQrKH4qB1bqm_91x7Q',
    },
    {
      provider: 'direct',
      url: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
    },
    {
      provider: 'external',
      url: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
    },
  ] as const;
  const results: {
    provider: string;
    status: string;
    detail?: string;
    playbackSeconds?: number;
    fullscreenWatermark?: boolean;
    mediaState?: { time: number; ready: number; network: number; error: number | null } | null;
  }[] = [];
  let widevineAvailable = false;
  try {
    await page.goto('/login');
    widevineAvailable = await page.evaluate(async () => {
      try {
        await navigator.requestMediaKeySystemAccess('com.widevine.alpha', [
          {
            initDataTypes: ['cenc'],
            videoCapabilities: [{ contentType: 'video/mp4; codecs="avc1.42E01E"' }],
          },
        ]);
        return true;
      } catch {
        return false;
      }
    });
    expect(
      (
        await db.rpc('update_settings', {
          doc: {
            ...original,
            embed_origins: ['https://interactive-examples.mdn.mozilla.net'],
            content_watermark_enabled: true,
          },
        })
      ).error,
    ).toBeNull();
    course.modules = [
      {
        id: course.modules[0].id,
        title: 'Проверка плееров',
        lessons: providers.map((p, i) => ({
          id: randomUUID(),
          slug: `player-${i}`,
          title: `Плеер ${p.provider}`,
          duration: 1,
          published: true,
          blocks: [
            {
              id: randomUUID(),
              version: 1,
              type: 'video',
              data: { ...p, title: `Видео ${p.provider}` },
            } as LessonBlock,
          ],
        })),
      },
    ];
    const saved = await db.rpc('save_course', { doc: course, expected_version: course.version });
    expect(saved.error).toBeNull();
    expect(
      (await db.rpc('publish_course', { cid: course.id, expected_version: saved.data.version }))
        .error,
    ).toBeNull();
    expect(
      (await db.rpc('set_access', { cid: course.id, target_user: accounts[2].id, enabled: true }))
        .error,
    ).toBeNull();
    await login(page, 2);
    for (const [i, provider] of providers.entries()) {
      try {
        console.log(`Checking ${provider.provider}`);
        const granted = page.waitForResponse(
          (r) => r.url().includes('/api/playback/') && r.status() === 200,
        );
        await page.goto(`/courses/${course.slug}/lessons/player-${i}`);
        const grant = await (await granted).json();
        expect(grant.protected).toBe(false);
        expect(grant.provider).toBe(provider.provider);
        await page
          .getByRole('button', { name: `Смотреть: Видео ${provider.provider}`, exact: true })
          .click();
        const video =
          provider.provider === 'direct'
            ? page.locator('video')
            : page.frameLocator('.video-frame iframe').locator('video').first();
        await expect(video).toBeAttached({ timeout: 30000 });
        await video.evaluate((node) => {
          (node as HTMLVideoElement).muted = true;
        });
        if (provider.provider === 'youtube')
          await page
            .frameLocator('.video-frame iframe')
            .getByRole('button', { name: /^(Воспроизвести(?: видео)?|Play(?: video)?)$/i })
            .first()
            .click({ timeout: 10000 });
        if (provider.provider === 'vimeo')
          await page
            .frameLocator('.video-frame iframe')
            .getByRole('button', { name: /^Play$/i })
            .first()
            .click({ timeout: 10000 });
        // Provider controls own their load/play lifecycle; calling HTMLMediaElement.play()
        // immediately afterwards can abort their pending source change (YouTube AbortError).
        if (provider.provider !== 'youtube' && provider.provider !== 'vimeo')
          await video.evaluate(async (node) => {
            const media = node as HTMLVideoElement;
            await Promise.race([
              media.play(),
              new Promise((_, reject) =>
                setTimeout(
                  () => reject(new Error('Player did not begin playback within 30 seconds')),
                  30000,
                ),
              ),
            ]);
          });
        await expect
          .poll(() => video.evaluate((node) => (node as HTMLVideoElement).currentTime), {
            timeout: 30000,
          })
          .toBeGreaterThan(2);
        const playbackSeconds = await video.evaluate(
          (node) => (node as HTMLVideoElement).currentTime,
        );
        await page.getByRole('button', { name: 'Развернуть плеер с водяным знаком' }).click();
        await expect
          .poll(() => page.evaluate(() => document.fullscreenElement?.className))
          .toContain('video-frame');
        await expect(page.locator('.video-frame .watermark')).toBeVisible();
        await page.locator('.video-frame').screenshot({
          path: qaPath(`screenshots/provider-${provider.provider}-fullscreen.png`),
        });
        await page.evaluate(() => document.exitFullscreen());
        results.push({
          provider: provider.provider,
          status: 'PASS',
          playbackSeconds,
          fullscreenWatermark: true,
        });
      } catch (error) {
        const frame = page
          .frames()
          .find((f) => f.url().includes('/embed/') || f.url().includes('player.vimeo.com'));
        const providerMessage = frame
          ? await frame
              .locator('body')
              .innerText({ timeout: 2000 })
              .catch(() => '')
          : '';
        const detail =
          (error instanceof Error
            ? error.message
                .replace(/\u001b\[[0-9;]*m/g, '')
                .split('\n')
                .slice(0, 4)
                .join(' ')
            : 'Player failed') +
          ' ' +
          providerMessage.slice(0, 800);
        const mediaState = frame
          ? await frame
              .locator('video')
              .first()
              .evaluate(
                (node) => {
                  const media = node as HTMLVideoElement;
                  return {
                    time: media.currentTime,
                    ready: media.readyState,
                    network: media.networkState,
                    error: media.error?.code ?? null,
                  };
                },
                undefined,
                { timeout: 2000 },
              )
              .catch(() => null)
          : null;
        results.push({ provider: provider.provider, status: 'FAIL', detail, mediaState });
        await page.locator('.video-frame').screenshot({
          path: qaPath(`screenshots/provider-${provider.provider}-failure.png`),
        });
        console.log(`${provider.provider}: ${detail}`);
      }
    }
    expect(results.filter((r) => r.status !== 'PASS')).toEqual([]);
  } finally {
    writeFileSync(
      qaPath('evidence/video-providers.json'),
      JSON.stringify(
        {
          executedAt: new Date().toISOString(),
          environment: { browserVersion: browser.version(), headless: false, widevineAvailable },
          results,
          sources: [
            'https://developers.google.com/youtube/iframe_api_reference',
            'https://github.com/vimeo/player.js',
            'https://rutube.ru/info/embed/',
            'https://developer.mozilla.org/en-US/docs/Web/HTML/Element/video',
          ],
        },
        null,
        2,
      ),
    );
    await db.rpc('update_settings', { doc: original });
    await db.rpc('delete_course', { cid: course.id });
    await context.close();
  }
});
