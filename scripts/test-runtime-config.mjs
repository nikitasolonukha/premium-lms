import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { qaPath } from './qa-paths.mjs';
process.loadEnvFile('.env.local');
if (process.env.DEPLOYMENT_ENV !== 'local') throw new Error('Runtime startup QA is local-only');
const failed = spawnSync(process.execPath, ['.next/standalone/runtime-entrypoint.mjs'], {
  env: { ...process.env, NODE_ENV: 'production', DEPLOYMENT_ENV: 'production', APP_URL: 'http://unsafe.example.com', HOSTNAME: '127.0.0.1', PORT: '3999' },
  encoding: 'utf8', timeout: 15000, windowsHide: true,
});
const output = `${failed.stdout ?? ''}${failed.stderr ?? ''}`;
assert.ok(!failed.error, 'Startup must exit itself, not time out');
assert.notEqual(failed.status, 0, 'Unsafe production startup must fail');
assert.ok(output.includes('Invalid server configuration') && output.includes('APP_URL'));
for (const key of ['SUPABASE_SECRET_KEY', 'RATE_LIMIT_SECRET'])
  assert.ok(!output.includes(process.env[key]), 'Startup diagnostics must not print a secret');
writeFileSync(qaPath('evidence/runtime-config.json'), JSON.stringify({
  executedAt: new Date().toISOString(), status: 'PASS',
  checks: ['actual production standalone startup fails on unsafe APP_URL', 'process exits without timeout', 'safe config field names only; no secret values'],
}, null, 2));
console.log('PASS: fail-fast production startup and sanitized diagnostics');
