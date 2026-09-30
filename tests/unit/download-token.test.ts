import { it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { issueDownloadToken, readDownloadToken } from '../../src/lib/download-token';
it('binds expiring grants to one asset and rejects tampering', () => {
  const now = 1000000,
    token = issueDownloadToken('test-asset', 'secret', now);
  expect(readDownloadToken(token, 'secret', now)?.id).toBe('test-asset');
  expect(readDownloadToken(token, 'wrong', now)).toBeNull();
  expect(readDownloadToken(token + 'x', 'secret', now)).toBeNull();
  expect(readDownloadToken(token, 'secret', now + 60000)).toBeNull();
  expect(readDownloadToken(token, 'secret', now + 59000)).not.toBeNull();
  expect(readDownloadToken('invalid', 'secret', now)).toBeNull();
});
it('rejects signed tokens from a different version, audience or purpose', () => {
  const now = 1000000;
  const token = issueDownloadToken('test-asset', 'secret', now);
  const payload = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString());
  expect(payload).toMatchObject({ v: 1, aud: 'academy:media', purpose: 'download' });
  for (const change of [{ v: 2 }, { aud: 'academy:playback' }, { purpose: 'upload' }]) {
    const body = Buffer.from(JSON.stringify({ ...payload, ...change })).toString('base64url');
    const sig = createHmac('sha256', 'secret').update('academy:media:download:v1:' + body).digest('base64url');
    expect(readDownloadToken(body + '.' + sig, 'secret', now)).toBeNull();
  }
});
