import { createHmac, timingSafeEqual } from 'node:crypto';
type DownloadGrant = { id: string; expires: number };
export function issueDownloadToken(id: string, secret: string, now = Date.now()) {
  const payload = Buffer.from(
    JSON.stringify({ id, expires: Math.floor(now / 1000) + 60 }),
  ).toString('base64url');
  return `${payload}.${createHmac('sha256', secret)
    .update('download:' + payload)
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
    if (extra.length || !signature) return null;
    const expected = createHmac('sha256', secret)
        .update('download:' + payload)
        .digest(),
      actual = Buffer.from(signature, 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    const grant = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (
      typeof grant.id !== 'string' ||
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
