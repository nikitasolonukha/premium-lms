import { describe, expect, it } from 'vitest';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { parseEnvironment } from '../../src/lib/config';

const base = () => ({
  NODE_ENV: 'production', APP_URL: 'https://academy.example.com',
  SUPABASE_URL: 'https://project.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'public-test-key',
  SUPABASE_SECRET_KEY: 'server-test-key', RATE_LIMIT_SECRET: randomBytes(32).toString('hex'),
});
describe('runtime configuration boundary', () => {
  it('requires safe HTTPS origins by default in a production build', () => {
    expect(parseEnvironment(base()).DEPLOYMENT_ENV).toBe('production');
    for (const field of ['APP_URL', 'SUPABASE_URL']) {
      for (const value of ['http://localhost:3000', 'https://user:password@example.com', 'https://example.com/path?secret=x', 'https://127.0.0.1'])
        expect(() => parseEnvironment({ ...base(), [field]: value })).toThrow(field);
    }
  });
  it('permits production-build local QA only with an explicit local deployment mode', () => {
    const local = { ...base(), DEPLOYMENT_ENV: 'local', APP_URL: 'http://localhost:3000', SUPABASE_URL: 'http://host.docker.internal:56321' };
    expect(parseEnvironment(local).DEPLOYMENT_ENV).toBe('local');
    expect(() => parseEnvironment({ ...local, APP_URL: 'http://public.example.com' })).toThrow('APP_URL');
    expect(() => parseEnvironment({ ...local, DEPLOYMENT_ENV: 'staging' })).toThrow();
  });
  it('rejects missing keys, weak secrets and public secret aliases without printing values', () => {
    for (const value of ['', 'a'.repeat(64), '0123456789abcdef'.repeat(4), 'short'])
      expect(() => parseEnvironment({ ...base(), RATE_LIMIT_SECRET: value })).toThrow('RATE_LIMIT_SECRET');
    expect(() => parseEnvironment({ ...base(), SUPABASE_SECRET_KEY: undefined })).toThrow('SUPABASE_SECRET_KEY');
    const secret = randomBytes(32).toString('hex');
    try { parseEnvironment({ ...base(), NEXT_PUBLIC_SUPABASE_SECRET_KEY: secret }); }
    catch (error) { expect(String(error)).toContain('NEXT_PUBLIC_SUPABASE_SECRET_KEY'); expect(String(error)).not.toContain(secret); return; }
    throw new Error('Public secret alias accepted');
  });
  it('requires an explicit proxy overwrite acknowledgement and a valid single header name', () => {
    expect(() => parseEnvironment({ ...base(), TRUSTED_IP_HEADER: 'x-real-ip' })).toThrow('TRUSTED_PROXY_ACKNOWLEDGED');
    expect(() => parseEnvironment({ ...base(), TRUSTED_IP_HEADER: 'x-real-ip\r\nx-test', TRUSTED_PROXY_ACKNOWLEDGED: 'true' })).toThrow('TRUSTED_IP_HEADER');
    expect(parseEnvironment({ ...base(), TRUSTED_IP_HEADER: 'X-Real-IP', TRUSTED_PROXY_ACKNOWLEDGED: 'true' }).TRUSTED_IP_HEADER).toBe('x-real-ip');
  });
  it('rejects partial or invalid provider configuration; verifies RSA keys', () => {
    expect(() => parseEnvironment({ ...base(), VIDEO_PROVIDER: 'cloudflare' })).toThrow('CLOUDFLARE');
    expect(() => parseEnvironment({ ...base(), MUX_SIGNING_KEY_ID: 'orphan' })).toThrow('MUX');
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const provider = {
      CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32), CLOUDFLARE_STREAM_API_TOKEN: 'test-token-for-provider-contract',
      CLOUDFLARE_STREAM_SIGNING_KEY_ID: 'test-key-id',
      CLOUDFLARE_STREAM_SIGNING_KEY: Buffer.from(privateKey.export({ type: 'pkcs8', format: 'pem' })).toString('base64'),
      CLOUDFLARE_STREAM_PLAYBACK_HOST: 'customer-testing.cloudflarestream.com',
    };
    expect(parseEnvironment({ ...base(), ...provider }).CLOUDFLARE_STREAM_SIGNING_KEY_ID).toBe('test-key-id');
    expect(() => parseEnvironment({ ...base(), ...provider, CLOUDFLARE_STREAM_SIGNING_KEY: 'invalid-private-key' })).toThrow('CLOUDFLARE_STREAM_SIGNING_KEY');
    expect(() => parseEnvironment({ ...base(), ...provider, CLOUDFLARE_STREAM_PLAYBACK_HOST: 'attacker.example.com' })).toThrow('CLOUDFLARE_STREAM_PLAYBACK_HOST');
  });
  it('allows monitoring to be absent and rejects malformed DSNs', () => {
    expect(parseEnvironment(base()).SENTRY_DSN).toBeUndefined();
    expect(() => parseEnvironment({ ...base(), SENTRY_DSN: 'http://secret@localhost/1' })).toThrow('SENTRY_DSN');
    expect(parseEnvironment({ ...base(), SENTRY_DSN: 'https://publickey@o1.ingest.sentry.io/123' }).SENTRY_DSN).toBeTruthy();
  });
});
