import { test, expect } from './test';
import { login } from './helpers';

// A deterministic protocol emulator, NOT evidence of external playback or CSP.
test('protected player contract: renewal restores position and access denial stops the embed', async ({
  browser,
}) => {
  const context = await browser.newContext({ bypassCSP: true });
  const page = await context.newPage();
  let grants = 0;
  try {
    await login(page, 2);
    await page.route('**/api/playback/**', (route) => {
      grants++;
      return grants > 2
        ? route.fulfill({ status: 404, json: { error: 'denied' } })
        : route.fulfill({
            json: {
              provider: 'mux',
              kind: 'iframe',
              protected: true,
              url: `https://player.mux.com/ProtocolFixture?playback-token=contract-${grants}`,
              expiresAt: new Date(Date.now() + 34000).toISOString(),
            },
          });
    });
    await page.route('https://player.mux.com/**', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: `<!doctype html><body><p>Protocol emulator</p><script>
      const origin=new URL(document.referrer).origin;
      const send=(event,value)=>parent.postMessage(JSON.stringify({context:'player.js',version:'0.0.11',event,value}),origin);
      addEventListener('message',e=>{if(e.origin!==origin)return;const d=JSON.parse(e.data);
        if(d.method==='addEventListener'&&d.value==='ready')send('ready',{src:location.href});
        if(d.method==='setCurrentTime')document.body.dataset.seek=String(d.value);
        if(d.method==='play'){document.body.dataset.play='true';send('play');send('timeupdate',{seconds:42});}
      });send('ready',{src:location.href});
    </script></body>`,
      }),
    );
    await page.goto('/courses/ai-product/lessons/lesson-1');
    await page
      .getByRole('button', { name: 'Смотреть: Вводное видео · демонстрация плеера' })
      .click();
    await expect.poll(() => grants).toBe(2);
    await expect(page.frameLocator('.video-frame iframe').locator('body')).toHaveAttribute(
      'data-seek',
      '42',
    );
    await expect(page.frameLocator('.video-frame iframe').locator('body')).toHaveAttribute(
      'data-play',
      'true',
    );
    await expect.poll(() => grants).toBe(3);
    await expect(page.locator('.video-frame iframe')).toHaveCount(0);
    await expect(page.locator('.video-frame [role=alert]')).toBeVisible();
  } finally {
    await context.close();
  }
});
