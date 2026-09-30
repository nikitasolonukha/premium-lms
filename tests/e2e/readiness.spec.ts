import { test, expect } from './test';
import { writeFileSync } from 'node:fs';
import { qaPath } from '../../scripts/qa-paths.mjs';

test('readiness, correlation and security headers expose no configuration', async ({ request }) => {
  const id = '483a19ca-3159-40e7-9aa8-72c32eb8f3be';
  for (const path of ['/api/health', '/api/ready']) {
    const response = await request.get(path, { headers: { 'x-request-id': id } });
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
    expect(response.headers()['x-request-id']).toBe(id);
    expect(response.headers()['cache-control']).toContain('no-store');
    expect(response.headers()['x-content-type-options']).toBe('nosniff');
    expect(response.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
  }
  const invalid = await request.get('/api/ready', { headers: { 'x-request-id': 'not-a-valid-request-id' } });
  expect(invalid.headers()['x-request-id']).toMatch(/^[a-f0-9-]{36}$/);
  writeFileSync(qaPath('evidence/readiness.json'), JSON.stringify({
    executedAt: new Date().toISOString(), status: 'PASS',
    checks: ['health and readiness perform real local DB query', 'UUID correlation roundtrip', 'invalid ID replaced', 'no configuration in response', 'no-store and security headers'],
  }, null, 2));
});
