import { describe, it, expect, vi } from 'vitest';
import { generateKeyPairSync, randomUUID, verify } from 'node:crypto';
import { createProtectedAdapter, protectedProviders } from '../../src/lib/protected-video';
import { parseEnvironment } from '../../src/lib/config';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const pem = Buffer.from(privateKey.export({ type: 'pkcs8', format: 'pem' })).toString('base64');
const base = { DEPLOYMENT_ENV: 'local', APP_URL: 'http://localhost:3000', SUPABASE_URL: 'http://localhost:56321', SUPABASE_PUBLISHABLE_KEY: 'test-public-key', SUPABASE_SECRET_KEY: 'test-server-key', RATE_LIMIT_SECRET: 'b9f3d0428c15ea907bf461dc0a5827319e60c472ab938ed41f65a029d08c73b5' };
const env = parseEnvironment({ ...base,
  CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32), CLOUDFLARE_STREAM_API_TOKEN: 'test-provider-api-token',
  CLOUDFLARE_STREAM_SIGNING_KEY_ID: 'cloudflare-key-id', CLOUDFLARE_STREAM_SIGNING_KEY: pem,
  CLOUDFLARE_STREAM_PLAYBACK_HOST: 'customer-testing.cloudflarestream.com',
  MUX_TOKEN_ID: 'mux-api-id', MUX_TOKEN_SECRET: 'test-mux-api-token-secret', MUX_SIGNING_KEY_ID: 'mux-key-id', MUX_SIGNING_PRIVATE_KEY: pem,
});
const viewer = { userId: randomUUID(), courseId: randomUUID(), lessonId: randomUUID(), ttlSeconds: 180 };
const now = 1790758000000;
const uid = 'b'.repeat(32), muxId = 'SignedPlayback123456';
function jwt(token: string) {
  const [header, body, signature] = token.split('.');
  expect(verify('RSA-SHA256', Buffer.from(`${header}.${body}`), publicKey, Buffer.from(signature, 'base64url'))).toBe(true);
  return { header: JSON.parse(Buffer.from(header, 'base64url').toString()), body: JSON.parse(Buffer.from(body, 'base64url').toString()) };
}
describe('protected provider contracts (simulated provider HTTP; real RSA signatures)', () => {
  it('hides unconfigured providers and never creates a placeholder adapter', () => {
    const empty = parseEnvironment(base);
    expect(protectedProviders(empty)).toEqual([]);
    expect(() => createProtectedAdapter('cloudflare', empty)).toThrow('NOT_CONFIGURED');
    expect(protectedProviders(env)).toEqual(['cloudflare', 'mux']);
  });
  it('signs Cloudflare only after checking requireSignedURLs and readyToStream', async () => {
    const fetcher = vi.fn(async () => Response.json({ success: true, result: { uid, requireSignedURLs: true, readyToStream: true } }));
    const adapter = createProtectedAdapter('cloudflare', env, fetcher, () => now);
    const grant = await adapter.issueGrant(uid, viewer);
    expect(grant.protected).toBe(true);
    const url = new URL(grant.url);
    expect(url.origin).toBe('https://customer-testing.cloudflarestream.com');
    const signed = jwt(url.pathname.split('/')[1]);
    expect(signed.header).toMatchObject({ alg: 'RS256', kid: 'cloudflare-key-id' });
    expect(signed.body).toMatchObject({ sub: uid, kid: 'cloudflare-key-id', exp: now / 1000 + 180 });
    expect(signed.body.downloadable).not.toBe(true);
    expect(grant.expiresAt).toBe(new Date(now + 180000).toISOString());
    expect(JSON.stringify(signed)).not.toContain(viewer.userId);
    expect(fetcher.mock.calls[0][0]).toBe(`https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/stream/${uid}`);
  });
  it.each([{ requireSignedURLs: false, readyToStream: true }, { requireSignedURLs: true, readyToStream: false }])('fails closed for unsafe Cloudflare metadata %j', async metadata => {
    const adapter = createProtectedAdapter('cloudflare', env, async () => Response.json({ success: true, result: { uid, ...metadata } }));
    await expect(adapter.issueGrant(uid, viewer)).rejects.toThrow();
  });
  it('signs separate Mux playback, thumbnail and storyboard audiences', async () => {
    const fetcher = vi.fn(async (url: string | URL | Request) => Response.json(String(url).includes('/playback-ids/')
      ? { data: { id: muxId, policy: 'signed', object: { type: 'asset', id: 'Asset123456' } } }
      : { data: { id: 'Asset123456', status: 'ready', playback_ids: [{ id: muxId, policy: 'signed' }] } }));
    const grant = await createProtectedAdapter('mux', env, fetcher, () => now).issueGrant(muxId, viewer);
    const url = new URL(grant.url);
    expect(url.origin).toBe('https://player.mux.com');
    for (const [parameter, audience] of [['playback-token', 'v'], ['thumbnail-token', 't'], ['storyboard-token', 's']]) {
      const signed = jwt(url.searchParams.get(parameter)!);
      expect(signed.body).toMatchObject({ sub: muxId, aud: audience, exp: now / 1000 + 180 });
      expect(signed.header.kid).toBe('mux-key-id');
    }
  });
  it('rejects a signed Mux playback ID if the same asset is also publicly playable', async () => {
    const fetcher = async (url: string | URL | Request) => Response.json(String(url).includes('/playback-ids/')
      ? { data: { id: muxId, policy: 'signed', object: { type: 'asset', id: 'Asset123456' } } }
      : { data: { id: 'Asset123456', status: 'ready', playback_ids: [{ id: muxId, policy: 'signed' }, { id: 'Public123456', policy: 'public' }] } });
    await expect(createProtectedAdapter('mux', env, fetcher).issueGrant(muxId, viewer)).rejects.toThrow('SOURCE_PUBLIC');
  });
  it('rejects malformed source IDs and excessive TTL before any outbound request', async () => {
    const fetcher = vi.fn();
    const adapter = createProtectedAdapter('cloudflare', env, fetcher);
    for (const source of ['https://attacker.example.com', '../keys', uid + '?token=bad', ''])
      await expect(adapter.issueGrant(source, viewer)).rejects.toThrow('INVALID_SOURCE');
    await expect(adapter.issueGrant(uid, { ...viewer, ttlSeconds: 3600 })).rejects.toThrow('INVALID_GRANT');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([403, 429, 500])('fails closed on provider HTTP %i without leaking the response', async status => {
    const adapter = createProtectedAdapter('cloudflare', env, async () => new Response('private-provider-response', { status }));
    await expect(adapter.issueGrant(uid, viewer)).rejects.toThrow('PROVIDER_UNAVAILABLE');
  });
});
