import { it, expect } from 'vitest';
import { safePlaywrightReport, safeServerLog, safeVideoReport } from '../../scripts/lib/safe-artifacts';
it('publishes only test outcomes and fixed server fields, never error bodies, auth data or call logs', () => {
  const secret = 'private-test-value';
  const input = {
    stats: { expected: 1, unexpected: 1, skipped: 0, secret },
    suites: [
      {
        specs: [
          {
            title: 'auth flow',
            file: 'auth.spec.ts',
            tests: [
              {
                results: [
                  {
                    status: 'failed',
                    duration: 13,
                    error: { message: secret },
                    attachments: [{ path: secret }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    errors: [secret],
  };
  const report = safePlaywrightReport(input);
  expect(JSON.stringify(report)).not.toContain(secret);
  expect(report.tests).toEqual([
    { title: 'auth flow', file: 'auth.spec.ts', status: 'FAIL', durationMs: 13 },
  ]);
  input.suites[0].specs[0].tests[0].results[0].error = {
    message: secret,
    ...{
      stack: `Error: ${secret}\n at /private/${secret}/tests/e2e/auth.spec.ts:91:23\n at https://${secret}/callback`,
    },
  };
  const located = safePlaywrightReport(input);
  expect(located.tests[0].failureLocation).toBe('auth.spec.ts:91:23');
  expect(JSON.stringify(located)).not.toContain(secret);
  const log = safeServerLog(
    JSON.stringify({
      event: 'action.failed',
      requestId: '483a19ca-3159-40e7-9aa8-72c32eb8f3be',
      timestamp: '2026-09-30T00:00:00Z',
      errorKind: 'Error',
      message: secret,
      headers: { authorization: secret },
    }) +
      '\n' +
      secret,
  );
  expect(log).toHaveLength(1);
  expect(JSON.stringify(log)).not.toContain(secret);
  expect(
    safeServerLog(JSON.stringify({ event: secret, requestId: secret, errorKind: secret })),
  ).toEqual([]);
});

it('retains real public provider failures and numeric diagnostics while removing source URLs and error text', () => {
  const input = {
    executedAt: '2026-09-30T00:00:00Z',
    environment: { browserVersion: '154.0.8037.92', headless: false, widevineAvailable: true },
    results: [
      { provider: 'direct', status: 'FAIL', detail: 'secret-token-value', url: 'https://private.example/secret-token-value', mediaState: { time: 0, ready: 0, network: 3, error: 4 }, sourceResponses: [{ status: 403, kind: 'media', url: 'secret-token-value' }] },
      { provider: 'youtube', status: 'PASS', playbackSeconds: 3.5, fullscreenWatermark: true },
    ],
  };
  const report = safeVideoReport(input);
  expect(report.status).toBe('FAIL');
  expect(report.results[0]).toMatchObject({ provider: 'direct', status: 'FAIL', mediaState: { error: 4 }, sourceResponses: [{ status: 403, kind: 'media' }] });
  expect(JSON.stringify(report)).not.toContain('secret-token-value');
  expect(() => safeVideoReport({ ...input, results: [{ provider: 'invented', status: 'PASS' }] })).toThrow();
});
