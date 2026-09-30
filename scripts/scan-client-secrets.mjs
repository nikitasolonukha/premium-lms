import { qaPath } from './qa-paths.mjs';
import { readdirSync, readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, relative } from 'node:path';
if (!process.env.SUPABASE_SECRET_KEY || !process.env.RATE_LIMIT_SECRET)
  throw new Error('Run with --env-file=.env.local so both server secrets are included');
const secrets = Object.entries(process.env)
  .filter(
    ([key, value]) =>
      value &&
      /^(SUPABASE_SECRET_KEY|RATE_LIMIT_SECRET|CLOUDFLARE_STREAM_(API_TOKEN|SIGNING_KEY)|MUX_(TOKEN_SECRET|SIGNING_PRIVATE_KEY)|MALWARE_SCANNER_TOKEN|SENTRY_AUTH_TOKEN|TELEGRAM_BOT_TOKEN|TELEGRAM_WEBHOOK_SECRET)$/.test(
        key,
      ),
  )
  .map(([, value]) => value);
for (const key of ['CLOUDFLARE_STREAM_SIGNING_KEY', 'MUX_SIGNING_PRIVATE_KEY']) {
  const value = process.env[key];
  if (value)
    secrets.push(
      value.replaceAll('\\n', '\n'),
      value.includes('-----BEGIN')
        ? Buffer.from(value.replaceAll('\\n', '\n')).toString('base64')
        : Buffer.from(value, 'base64').toString('utf8'),
    );
}
if (existsSync('.local/seed-accounts.json'))
  for (const a of JSON.parse(readFileSync('.local/seed-accounts.json', 'utf8'))) {
    secrets.push(a.password);
    if (a.totpSecret) secrets.push(a.totpSecret);
  }
if (!secrets.length) throw new Error('Load the local test environment before scanning');
const roots = ['.next/static', 'src', 'public', 'docs', 'scripts', 'tests', 'supabase', '.github','workers'],
  matches = [];
let scanned = 0;
function scanFile(file) {
  if (!existsSync(file)) return;
  const bytes = readFileSync(file);
  scanned++;
  if (secrets.some((secret) => bytes.includes(Buffer.from(secret))))
    matches.push(relative('.', file));
}
function visit(path) {
  if (!existsSync(path)) return;
  for (const item of readdirSync(path, { withFileTypes: true })) {
    const file = join(path, item.name);
    if (item.isDirectory()) {
      if (!['screenshots', '.temp', '.branches'].includes(item.name)) visit(file);
    } else if (
      /\.(js|mjs|json|jsonl|ts|tsx|html|md|css|map|sql|log|toml|ya?ml|txt)$/.test(item.name)
    )
      scanFile(file);
  }
}
roots.forEach(visit);
[
  'README.md',
  '.env.example',
  'Dockerfile',
  '.dockerignore',
  '.gitignore',
  'next.config.ts',
  'playwright.config.ts',
  'vitest.config.ts',
  'package.json',
  'package-lock.json',
].forEach(scanFile);
const result = {
  executedAt: new Date().toISOString(),
  status: matches.length ? 'FAIL' : 'PASS',
  scanned,
  secretClasses: [
    'Supabase server key',
    'rate-limit secret',
    'provider/scanner/monitoring secrets when configured',
    'local account passwords and TOTP',
  ],
  matchedFiles: matches,
};
mkdirSync(qaPath('evidence'), { recursive: true });
writeFileSync(qaPath('evidence/client-secrets.json'), JSON.stringify(result, null, 2));
console.log(
  `${result.status}: ${scanned} source, config, evidence and browser bundle files checked; ${matches.length} matches. Secret values never printed.`,
);
if (matches.length) process.exitCode = 1;
