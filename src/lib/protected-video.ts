import { randomUUID, sign } from 'node:crypto';
import { z } from 'zod';
import { signingKey, type RuntimeEnvironment } from './config';
import type { ProtectedVideoProviderAdapter } from './video';

export type ProtectedProvider = 'cloudflare' | 'mux';
export const PLAYBACK_TTL_SECONDS = 180;
const cloudflareId = /^[a-f0-9]{32}$/;
const muxId = /^[A-Za-z0-9]{8,128}$/;
const viewerSchema = z.object({
  userId: z.uuid(), courseId: z.uuid(), lessonId: z.uuid(),
  ttlSeconds: z.number().int().min(30).max(PLAYBACK_TTL_SECONDS),
}).strict();
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' ? value as Record<string, unknown> : {};

export function protectedProviders(env: RuntimeEnvironment): ProtectedProvider[] {
  const result: ProtectedProvider[] = [];
  if (env.CLOUDFLARE_STREAM_SIGNING_KEY) result.push('cloudflare');
  if (env.MUX_SIGNING_PRIVATE_KEY) result.push('mux');
  return result;
}

export function createProtectedAdapter(
  provider: ProtectedProvider,
  env: RuntimeEnvironment,
  fetcher: typeof fetch = fetch,
  now: () => number = Date.now,
  beforeSign: () => Promise<void> = async () => {},
): ProtectedVideoProviderAdapter & { checkConnection(): Promise<void> } {
  if (!protectedProviders(env).includes(provider)) throw new Error('NOT_CONFIGURED');
  const cloudflare = provider === 'cloudflare';
  const keyId = cloudflare ? env.CLOUDFLARE_STREAM_SIGNING_KEY_ID! : env.MUX_SIGNING_KEY_ID!;
  const key = signingKey(cloudflare ? env.CLOUDFLARE_STREAM_SIGNING_KEY! : env.MUX_SIGNING_PRIVATE_KEY!);
  const authorization = cloudflare ? `Bearer ${env.CLOUDFLARE_STREAM_API_TOKEN}`
    : `Basic ${Buffer.from(`${env.MUX_TOKEN_ID}:${env.MUX_TOKEN_SECRET}`).toString('base64')}`;
  const api = cloudflare ? `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}` : 'https://api.mux.com';
  async function get(path: string) {
    try {
      const response = await fetcher(api + path, {
        headers: { Authorization: authorization, Accept: 'application/json' },
        cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error();
      const reader = response.body?.getReader();
      if (!reader) throw new Error();
      const chunks: Uint8Array[] = []; let length = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          length += value.byteLength;
          if (length > 1048576) { await reader.cancel(); throw new Error(); }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
      const body = record(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      if (cloudflare && body.success !== true) throw new Error();
      return cloudflare ? body.result : body.data;
    } catch { throw new Error('PROVIDER_UNAVAILABLE'); }
  }
  const validateSource = (source: string) => (cloudflare ? cloudflareId : muxId).test(source);
  function token(source: string, expires: number, audience?: 'v' | 't' | 's') {
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: keyId })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
      sub: source, kid: keyId, exp: expires, nbf: Math.floor(now() / 1000) - 5,
      jti: randomUUID(), ...(audience ? { aud: audience } : {}),
    })).toString('base64url');
    const content = `${header}.${payload}`;
    return `${content}.${sign('RSA-SHA256', Buffer.from(content), key).toString('base64url')}`;
  }
  return {
    provider, capabilities: { signedPlayback: true, nativeFullscreen: true }, validateSource,
    async checkConnection() {
      if (cloudflare) {
        const keys = await get('/stream/keys');
        if (!Array.isArray(keys) || !keys.some(item => record(item).id === keyId)) throw new Error('SIGNING_KEY_NOT_FOUND');
      } else {
        const data = record(await get(`/system/v1/signing-keys/${encodeURIComponent(keyId)}`));
        if (data.id !== keyId) throw new Error('SIGNING_KEY_NOT_FOUND');
      }
      // API/key presence is not proof of live playback; live QA verifies the issued token.
    },
    async issueGrant(source, viewer) {
      if (!validateSource(source)) throw new Error('INVALID_SOURCE');
      if (!viewerSchema.safeParse(viewer).success) throw new Error('INVALID_GRANT');
      if (cloudflare) {
        const data = record(await get(`/stream/${source}`));
        if (data.uid !== source || data.requireSignedURLs !== true) throw new Error('SOURCE_PUBLIC');
        if (data.readyToStream !== true) throw new Error('SOURCE_NOT_READY');
      } else {
        const playback = record(await get(`/video/v1/playback-ids/${source}`));
        if (playback.id !== source || playback.policy !== 'signed') throw new Error('SOURCE_PUBLIC');
        const object = record(playback.object);
        if (object.type !== 'asset' || typeof object.id !== 'string' || !muxId.test(object.id)) throw new Error('INVALID_SOURCE');
        const asset = record(await get(`/video/v1/assets/${object.id}`));
        if (asset.id !== object.id || asset.status !== 'ready') throw new Error('SOURCE_NOT_READY');
        if (!Array.isArray(asset.playback_ids) || !asset.playback_ids.length
          || asset.playback_ids.some(item => record(item).policy !== 'signed')) throw new Error('SOURCE_PUBLIC');
      }
      // Provider metadata requests can outlive a concurrent enrollment/session revocation.
      await beforeSign();
      const expires = Math.floor(now() / 1000) + viewer.ttlSeconds;
      const url = cloudflare
        ? new URL(`https://${env.CLOUDFLARE_STREAM_PLAYBACK_HOST}/${token(source, expires)}/iframe`)
        : new URL(`https://player.mux.com/${source}`);
      if (!cloudflare) {
        url.searchParams.set('playback-token', token(source, expires, 'v'));
        url.searchParams.set('thumbnail-token', token(source, expires, 't'));
        url.searchParams.set('storyboard-token', token(source, expires, 's'));
      }
      return { kind: 'iframe', provider, protected: true, expiresAt: new Date(expires * 1000).toISOString(), url: url.toString() };
    },
  };
}
