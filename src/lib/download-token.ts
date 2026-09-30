import { createHmac, timingSafeEqual } from 'node:crypto';
type DownloadGrant = { v: 1; aud: 'academy:media'; purpose: 'download'; id: string; expires: number };
const namespace = 'academy:media:download:v1:';
export function issueDownloadToken(id: string, secret: string, now = Date.now()) {
  const payload = Buffer.from(
    JSON.stringify({ v: 1, aud: 'academy:media', purpose: 'download', id, expires: Math.floor(now / 1000) + 60 }),
  ).toString('base64url');
  return `${payload}.${createHmac('sha256', secret)
    .update(namespace + payload)
    .digest('base64url')}`;
}
export function readDownloadToken(
  token: string,
  secret: string,
  now = Date.now(),
): DownloadGrant | null {
  try {
    if (token.length > 400) return null;
    const [payload, signature, ...extra] = token.split('.');
    if (extra.length || !signature || !/^[A-Za-z0-9_-]+$/.test(payload) || !/^[A-Za-z0-9_-]{43}$/.test(signature)) return null;
    const expected = createHmac('sha256', secret)
        .update(namespace + payload)
        .digest(),
      actual = Buffer.from(signature, 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    const grant = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (
      !grant || grant.v !== 1 || grant.aud !== 'academy:media' || grant.purpose !== 'download' ||
      typeof grant.id !== 'string' || grant.id.length > 128 || !grant.id.length ||
      !Number.isInteger(grant.expires) ||
      grant.expires <= Math.floor(now / 1000) ||
      grant.expires > Math.floor(now / 1000) + 60
    )
      return null;
    return grant;
  } catch {
    return null;
  }
}
