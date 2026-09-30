import { execFileSync } from 'node:child_process';
import { writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
process.loadEnvFile('.env.local');
if (process.env.SUPABASE_URL !== 'http://127.0.0.1:56321')
  throw new Error('Container smoke is local-only');
const envPath = '.local/docker-runtime.env',
  name = `premium-lms-runtime-qa-${randomUUID()}`;
const env = {
  APP_URL: 'http://localhost:3001',
  SUPABASE_URL: 'http://host.docker.internal:56321',
  SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
  RATE_LIMIT_SECRET: process.env.RATE_LIMIT_SECRET,
};
mkdirSync('.local', { recursive: true });
writeFileSync(
  envPath,
  Object.entries(env)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n'),
);
let imageId;
const failures = [];
const docker = (...args) =>
  execFileSync('docker', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30_000,
    killSignal: 'SIGKILL',
  }).trim();
try {
  docker(
    'run',
    '--rm',
    '-d',
    '--name',
    name,
    '--env-file',
    envPath,
    '-p',
    '127.0.0.1:3001:3000',
    'premium-lms-qa:local',
  );
  let health;
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    health = await fetch('http://localhost:3001/api/health', {
      signal: AbortSignal.timeout(3_000),
    }).catch(() => null);
    if (health?.ok) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  assert.equal(health?.status, 200);
  const landing = await fetch('http://localhost:3001/', {
    signal: AbortSignal.timeout(5_000),
  });
  assert.equal(landing.status, 200);
  assert.ok((await landing.text()).includes('Академия'));
  assert.equal(docker('exec', name, 'id', '-u'), '1001');
  assert.equal(
    docker(
      'exec',
      name,
      'node',
      '-e',
      "console.log(require('node:fs').existsSync('/app/.env.local'))",
    ),
    'false',
  );
  imageId = docker('image', 'inspect', '--format', '{{.Id}}', 'premium-lms-qa:local');
} catch (error) {
  failures.push(error);
} finally {
  // A timed-out `run` can still have created a container. Cleanup targets only
  // this invocation's unique name; no shared services or volumes are touched.
  try {
    docker('stop', '--timeout', '10', name);
  } catch (error) {
    failures.push(error);
  }
  try {
    unlinkSync(envPath);
  } catch (error) {
    failures.push(error);
  }
}
if (failures.length === 1) throw failures[0];
if (failures.length > 1) throw new AggregateError(failures, 'Container smoke and cleanup failed');
writeFileSync(
  'docs/qa/evidence/container.json',
  JSON.stringify(
    {
      status: 'PASS',
      executedAt: new Date().toISOString(),
      imageId,
      checks: [
        'standalone starts as uid 1001',
        'health checks actual local database',
        'public page returns 200',
        'env file absent from image',
        'loopback-only smoke port; temporary container stopped',
        'temporary credential file removed',
      ],
    },
    null,
    2,
  ),
);
console.log('PASS: container runtime, uid 1001, database health, public page and cleanup');
