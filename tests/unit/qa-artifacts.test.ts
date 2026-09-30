import { it, expect } from 'vitest';
import { safePlaywrightReport, safeServerLog } from '../../scripts/lib/safe-artifacts';
it('publishes only test outcomes and fixed server fields, never error bodies, auth data or call logs', () => {
  const secret = 'private-test-value';
  const input = { stats: { expected: 1, unexpected: 1, skipped: 0, secret }, suites: [{ specs: [{ title: 'auth flow', file: 'auth.spec.ts', tests: [{ results: [{ status: 'failed', duration: 13, error: { message: secret }, attachments: [{ path: secret }] }] }] }] }], errors: [secret] };
  const report = safePlaywrightReport(input);
  expect(JSON.stringify(report)).not.toContain(secret);
  expect(report.tests).toEqual([{ title: 'auth flow', file: 'auth.spec.ts', status: 'FAIL', durationMs: 13 }]);
  const log = safeServerLog(JSON.stringify({ event: 'action.failed', requestId: '483a19ca-3159-40e7-9aa8-72c32eb8f3be', timestamp: '2026-09-30T00:00:00Z', errorKind: 'Error', message: secret, headers: { authorization: secret } }) + '\n' + secret);
  expect(log).toHaveLength(1); expect(JSON.stringify(log)).not.toContain(secret);
  expect(safeServerLog(JSON.stringify({ event: secret, requestId: secret, errorKind: secret }))).toEqual([]);
});
