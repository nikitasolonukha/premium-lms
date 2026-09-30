import { z } from 'zod';
import { createPrivateKey } from 'node:crypto';
import { isIP } from 'node:net';

/** Accept provider-exported PEM or base64 PEM; never include input in an error. */
export function signingKey(value: string) {
  try {
    const pem = value.includes('-----BEGIN')
      ? value.replaceAll('\\n', '\n')
      : Buffer.from(value, 'base64').toString('utf8');
    const key = createPrivateKey(pem);
    if (key.asymmetricKeyType !== 'rsa' || (key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048)
      throw new Error();
    return key;
  } catch {
    throw new Error('Invalid RSA signing key (2048 bits minimum)');
  }
}

function strongSecret(value: string) {
  // This detects weak/repeated values; only a CSPRNG can establish actual entropy.
  if (!/^[A-Za-z0-9+/_=-]{43,256}$/.test(value) || new Set(value).size < 12) return false;
  for (let period = 1; period <= value.length / 2; period++)
    if (
      value.length % period === 0 &&
      value.slice(0, period).repeat(value.length / period) === value
    )
      return false;
  const bytes =
    /^[a-f\d]+$/i.test(value) && value.length % 2 === 0
      ? Buffer.from(value, 'hex')
      : Buffer.from(value, 'base64');
  return bytes.length >= 32;
}

function safeOrigin(value: string, local: boolean, database: boolean) {
  try {
    const url = new URL(value);
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/')
      return false;
    const localHosts = database
      ? ['localhost', '127.0.0.1', 'host.docker.internal']
      : ['localhost', '127.0.0.1'];
    if (local)
      return localHosts.includes(url.hostname) && ['http:', 'https:'].includes(url.protocol);
    return (
      url.protocol === 'https:' &&
      url.hostname.includes('.') &&
      !isIP(url.hostname) &&
      !url.hostname.includes(':') &&
      !/(^|\.)(localhost|local|internal|test|invalid)$/.test(url.hostname) &&
      !url.hostname.endsWith('.')
    );
  } catch {
    return false;
  }
}

const optional = z.string().min(1).max(20000).optional();
const schema = z
  .object({
    DEPLOYMENT_ENV: z.enum(['local', 'staging', 'production']),
    APP_URL: z.string().min(1).max(2048),
    SUPABASE_URL: z.string().min(1).max(2048),
    SUPABASE_PUBLISHABLE_KEY: z.string().min(10).max(4096),
    SUPABASE_SECRET_KEY: z.string().min(10).max(4096),
    RATE_LIMIT_SECRET: z.string().refine(strongSecret),
    TRUSTED_IP_HEADER: z
      .string()
      .regex(/^[a-zA-Z][a-zA-Z0-9-]{0,63}$/)
      .transform((v) => v.toLowerCase())
      .optional(),
    TRUSTED_PROXY_ACKNOWLEDGED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    VIDEO_PROVIDER: z.enum(['disabled', 'cloudflare', 'mux']).default('disabled'),
    MALWARE_SCANNER: z.enum(['disabled', 'external']).default('disabled'),
    MALWARE_SCANNER_URL: z
      .string()
      .max(2048)
      .refine((value) => {
        try {
          const url = new URL(value);
          return (
            safeOrigin(url.origin, false, false) &&
            !url.username &&
            !url.password &&
            !url.search &&
            !url.hash
          );
        } catch {
          return false;
        }
      })
      .optional(),
    MALWARE_SCANNER_TOKEN: z.string().min(20).max(512).optional(),
    CLOUDFLARE_ACCOUNT_ID: z
      .string()
      .regex(/^[a-f0-9]{32}$/)
      .optional(),
    CLOUDFLARE_STREAM_API_TOKEN: z.string().min(20).max(512).optional(),
    CLOUDFLARE_STREAM_SIGNING_KEY_ID: z
      .string()
      .regex(/^[a-zA-Z0-9_-]{3,128}$/)
      .optional(),
    CLOUDFLARE_STREAM_SIGNING_KEY: optional,
    CLOUDFLARE_STREAM_PLAYBACK_HOST: z
      .string()
      .regex(/^customer-[a-z0-9-]+\.cloudflarestream\.com$/)
      .optional(),
    MUX_TOKEN_ID: z
      .string()
      .regex(/^[a-zA-Z0-9_-]{3,128}$/)
      .optional(),
    MUX_TOKEN_SECRET: z.string().min(20).max(512).optional(),
    MUX_SIGNING_KEY_ID: z
      .string()
      .regex(/^[a-zA-Z0-9_-]{3,128}$/)
      .optional(),
    MUX_SIGNING_PRIVATE_KEY: optional,
    SENTRY_DSN: z
      .string()
      .max(2048)
      .refine((value) => {
        try {
          const url = new URL(value);
          return (
            url.protocol === 'https:' &&
            !!url.username &&
            !url.password &&
            !url.search &&
            !url.hash &&
            /^\/\d+$/.test(url.pathname) &&
            url.hostname.includes('.') &&
            !isIP(url.hostname) &&
            !/(^|\.)(localhost|local|internal)$/.test(url.hostname)
          );
        } catch {
          return false;
        }
      })
      .optional(),
    SENTRY_ENVIRONMENT: z
      .string()
      .regex(/^[a-zA-Z0-9_-]{1,64}$/)
      .optional(),
  })
  .strict()
  .superRefine((env, ctx) => {
    const fail = (field: string) =>
      ctx.addIssue({
        code: 'custom',
        path: [field],
        message: 'Unsafe or incomplete configuration',
      });
    if (!safeOrigin(env.APP_URL, env.DEPLOYMENT_ENV === 'local', false)) fail('APP_URL');
    if (!safeOrigin(env.SUPABASE_URL, env.DEPLOYMENT_ENV === 'local', true)) fail('SUPABASE_URL');
    if (env.TRUSTED_IP_HEADER && !env.TRUSTED_PROXY_ACKNOWLEDGED)
      fail('TRUSTED_PROXY_ACKNOWLEDGED');
    if (env.MALWARE_SCANNER === 'external') {
      if (!env.MALWARE_SCANNER_URL) fail('MALWARE_SCANNER_URL');
      if (!env.MALWARE_SCANNER_TOKEN) fail('MALWARE_SCANNER_TOKEN');
    } else if (env.MALWARE_SCANNER_URL || env.MALWARE_SCANNER_TOKEN) fail('MALWARE_SCANNER');
    for (const [provider, fields] of [
      [
        'cloudflare',
        [
          'CLOUDFLARE_ACCOUNT_ID',
          'CLOUDFLARE_STREAM_API_TOKEN',
          'CLOUDFLARE_STREAM_SIGNING_KEY_ID',
          'CLOUDFLARE_STREAM_SIGNING_KEY',
          'CLOUDFLARE_STREAM_PLAYBACK_HOST',
        ],
      ],
      [
        'mux',
        ['MUX_TOKEN_ID', 'MUX_TOKEN_SECRET', 'MUX_SIGNING_KEY_ID', 'MUX_SIGNING_PRIVATE_KEY'],
      ],
    ] as const) {
      if (env.VIDEO_PROVIDER === provider || fields.some((key) => !!env[key]))
        for (const key of fields) if (!env[key]) fail(key);
    }
    for (const key of ['CLOUDFLARE_STREAM_SIGNING_KEY', 'MUX_SIGNING_PRIVATE_KEY'] as const) {
      if (env[key]) {
        try {
          signingKey(env[key]);
        } catch {
          fail(key);
        }
      }
    }
  });
export type RuntimeEnvironment = z.infer<typeof schema>;

export function parseEnvironment(raw: Record<string, string | undefined>): RuntimeEnvironment {
  const exposed = Object.keys(raw).filter(
    (key) => raw[key] && /^NEXT_PUBLIC_.*(SECRET|PRIVATE|SIGNING|TOKEN|RATE_LIMIT)/.test(key),
  );
  if (exposed.length) throw new Error(`Unsafe public environment variables: ${exposed.join(', ')}`);
  // Environment includes OS/framework variables. Only our explicit schema is selected.
  const input = Object.fromEntries(
    Object.keys(schema.shape).map((key) => [key, raw[key]?.trim() || undefined]),
  );
  input.DEPLOYMENT_ENV ??= raw.NODE_ENV === 'production' ? 'production' : 'local';
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    throw new Error(
      `Invalid server configuration: ${[...new Set(parsed.error.issues.map((issue) => issue.path.join('.')))].join(', ')}`,
    );
  return parsed.data;
}
