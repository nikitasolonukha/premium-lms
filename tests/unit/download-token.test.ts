import { it, expect } from 'vitest';
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
