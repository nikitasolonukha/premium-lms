import { test, expect } from './test';
import pg from 'pg';
import { login, browserSessionId } from './helpers';
import { writeFileSync } from 'node:fs';
import { qaPath } from '../../scripts/qa-paths.mjs';

test('staff warning reads deadlines without extending session; explicit continuation and expiry', async ({
  page,
}) => {
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  let sid: string | undefined;
  try {
    await login(page, 0);
    await page.waitForLoadState('networkidle');
    sid = await browserSessionId(page);
    await db.query(
      "update private.admin_sessions set last_active_at=now()-interval '29 minutes' where session_id=$1",
      [sid],
    );
    const before = (
      await db.query('select last_active_at from private.admin_sessions where session_id=$1', [sid])
    ).rows[0].last_active_at.toISOString();
    const response = await page.request.get('/api/staff-session');
    expect(response.status()).toBe(200);
    expect(response.headers()['cache-control']).toContain('no-store');
    expect(
      (
        await db.query('select last_active_at from private.admin_sessions where session_id=$1', [
          sid,
        ])
      ).rows[0].last_active_at.toISOString(),
    ).toBe(before);
    // A visibility event only refreshes deadlines, never touches staff activity.
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(
      page.getByRole('status').filter({ hasText: 'Сессия администратора скоро завершится' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Продолжить сессию' }).click();
    await expect(page.getByRole('button', { name: 'Продолжить сессию' })).toBeHidden();
    expect(
      (
        await db.query('select last_active_at from private.admin_sessions where session_id=$1', [
          sid,
        ])
      ).rows[0].last_active_at.toISOString(),
    ).not.toBe(before);
    await db.query(
      "update private.admin_sessions set last_active_at=now()-interval '31 minutes' where session_id=$1",
      [sid],
    );
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(
      page.getByText('Сессия завершилась. Войдите снова, чтобы сохранить изменения.', {
        exact: true,
      }),
    ).toBeVisible();
    expect((await page.request.get('/api/staff-session')).status()).toBe(403);
    writeFileSync(
      qaPath('evidence/staff-session-ui.json'),
      JSON.stringify(
        {
          status: 'PASS',
          checks: [
            'deadline GET does not extend session',
            'idle warning visible',
            'explicit continuation extends idle',
            'expired session denied and warning visible',
          ],
        },
        null,
        2,
      ),
    );
  } finally {
    if (sid)
      await db.query('update private.admin_sessions set last_active_at=now() where session_id=$1', [
        sid,
      ]);
    await db.end();
  }
});

test('Admin prefetch checks actual session without extending idle; expired prefetch is denied', async ({
  page,
}) => {
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  let sid: string | undefined;
  try {
    await login(page, 0);
    await page.waitForLoadState('networkidle');
    sid = await browserSessionId(page);
    await db.query(
      "update private.admin_sessions set last_active_at=now()-interval '29 minutes' where session_id=$1",
      [sid],
    );
    const before = (
      await db.query('select last_active_at from private.admin_sessions where session_id=$1', [sid])
    ).rows[0].last_active_at.toISOString();
    const transports: Record<string, string>[] = [
      { 'next-router-prefetch': '1' },
      { 'next-router-segment-prefetch': '/_tree' },
      { purpose: 'prefetch' },
      { 'sec-purpose': 'prefetch;prerender' },
    ];
    for (const headers of transports) {
      const response = await page.request.get('/admin/courses', { headers });
      expect(response.status()).toBe(200);
      expect(
        (
          await db.query('select last_active_at from private.admin_sessions where session_id=$1', [
            sid,
          ])
        ).rows[0].last_active_at.toISOString(),
      ).toBe(before);
    }
    await db.query(
      "update private.admin_sessions set last_active_at=now()-interval '31 minutes' where session_id=$1",
      [sid],
    );
    const denied = await page.request.get('/admin/courses', {
      headers: { purpose: 'prefetch' },
      maxRedirects: 0,
    });
    expect(denied.status()).toBe(307);
    expect(denied.headers().location).toContain('/login?reason=session');
    writeFileSync(
      qaPath('evidence/staff-prefetch.json'),
      JSON.stringify(
        {
          status: 'PASS',
          checks: [
            'actual browser session ID',
            'four background prefetch transports preserve idle',
            'expired prefetch denied',
          ],
          scope:
            'Real production routes and database; header selects readonly checks, not authorization bypass.',
        },
        null,
        2,
      ),
    );
  } finally {
    if (sid)
      await db.query('update private.admin_sessions set last_active_at=now() where session_id=$1', [
        sid,
      ]);
    await db.end();
  }
});
