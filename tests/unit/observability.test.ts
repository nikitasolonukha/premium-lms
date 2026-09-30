import { expect, it } from 'vitest';
import { safeErrorEvent, beforeSend } from '../../src/lib/observability';
const id = '483a19ca-3159-40e7-9aa8-72c32eb8f3be';
it('logs only an allowlisted error envelope, never arbitrary exception contents', () => {
  const secret = 'sensitive-example-payload';
  const error = Object.assign(new Error(`${secret} user@example.com https://provider.example/token`), { body: { password: secret }, code: secret });
  const event = safeErrorEvent('media.failed', error, id);
  expect(event.requestId).toBe(id);
  expect(JSON.stringify(event)).not.toContain(secret);
  expect(JSON.stringify(event)).not.toContain('user@example.com');
  expect(event.event).toBe('media.failed');
  expect(event.errorKind).toBe('Error');
});
it('reconstructs Sentry events, dropping PII, tokens, paths, user, request and unknown metadata', () => {
  const input = {
    event_id: 'a'.repeat(32), level: 'error', timestamp: 100,
    message: 'otp=123456', user: { email: 'user@example.com' },
    request: { url: 'https://site/auth/callback?token=private', headers: { Authorization: 'Bearer private', Cookie: 'private' }, data: { password: 'private' } },
    breadcrumbs: [{ message: '/api/download/private' }], contexts: { trace: { data: { signedUrl: 'private' } } },
    exception: { values: [{ type: 'TypeError', value: 'private', stacktrace: { frames: [{ filename: '/Users/private/file.ts' }] } }] },
    tags: { request_id: id, event: 'media.failed', private: 'private' },
    extra: { reset_token: 'private' },
  };
  const output = beforeSend(input);
  expect(output.tags).toEqual({ request_id: id, event: 'media.failed' });
  expect(JSON.stringify(output)).not.toMatch(/private|123456|user@example/);
  expect(output.exception?.values[0].type).toBe('TypeError');
});
