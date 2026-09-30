import { execFileSync } from 'node:child_process';
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
const status = JSON.parse(
  execFileSync(
    process.execPath,
    ['node_modules/supabase/dist/supabase.js', 'status', '-o', 'json'],
    { encoding: 'utf8', env: { ...process.env, DO_NOT_TRACK: '1' } },
  ),
);
if (!/^http:\/\/(localhost|127\.0\.0\.1):56321$/.test(status.API_URL))
  throw new Error('Expected isolated local Supabase on port 56321');
const existing = existsSync('.env.local') ? readFileSync('.env.local', 'utf8') : '';
if (existing && !existing.includes('56321'))
  throw new Error('Refusing to replace a non-local .env.local');
const secret = existing.match(/^RATE_LIMIT_SECRET=(.+)$/m)?.[1] ?? randomBytes(32).toString('hex');
writeFileSync(
  '.env.local',
  [
    'DEPLOYMENT_ENV=local',
    'APP_URL=http://localhost:3000',
    `SUPABASE_URL=${status.API_URL}`,
    `SUPABASE_PUBLISHABLE_KEY=${status.PUBLISHABLE_KEY || status.ANON_KEY}`,
    `SUPABASE_SECRET_KEY=${status.SECRET_KEY || status.SERVICE_ROLE_KEY}`,
    `DATABASE_URL=${status.DB_URL}`,
    `RATE_LIMIT_SECRET=${secret}`,
    'TRUSTED_IP_HEADER=',
    'TRUSTED_PROXY_ACKNOWLEDGED=false',
    '',
  ].join('\n'),
  { mode: 0o600 },
);
console.log('Local configuration saved to .env.local. Credentials were not printed.');
