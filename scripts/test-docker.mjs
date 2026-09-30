import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { qaPath } from './qa-paths.mjs';
const image = process.env.QA_IMAGE ?? 'premium-lms:qa';
if (!/^premium-lms:[a-zA-Z0-9_.-]+$/.test(image))
  throw new Error('Only a local premium-lms image is allowed');
const docker = (...args) =>
  execFileSync('docker', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 60000,
  }).trim();
const name = 'lms-runtime-qa-' + randomBytes(6).toString('hex');
mkdirSync('.local', { recursive: true });
const envPath = resolve('.local', name + '.env');
const environment = [
  'DEPLOYMENT_ENV=local',
  'APP_URL=http://localhost:3000',
  'SUPABASE_URL=http://host.docker.internal:56321',
  'SUPABASE_PUBLISHABLE_KEY=runtime-test-public-placeholder',
  'SUPABASE_SECRET_KEY=runtime-test-server-placeholder',
  'RATE_LIMIT_SECRET=' + randomBytes(32).toString('hex'),
];
writeFileSync(envPath, environment.join('\n'), { mode: 0o600 });
try {
  const user = docker('image', 'inspect', image, '--format', '{{.Config.User}}');
  assert.ok(user === 'academy' || user === '1001');
  const labels = JSON.parse(
    docker('image', 'inspect', image, '--format', '{{json .Config.Labels}}'),
  );
  assert.equal(
    labels['org.opencontainers.image.source'],
    'https://github.com/nikitasolonukha/premium-lms',
  );
  assert.match(labels['org.opencontainers.image.revision'], /^[a-f0-9]{40}$/);
  if (process.env.GITHUB_SHA)
    assert.equal(labels['org.opencontainers.image.revision'], process.env.GITHUB_SHA);
  docker(
    'run',
    '-d',
    '--name',
    name,
    '--read-only',
    '--tmpfs',
    '/tmp:rw,noexec,nosuid,size=64m',
    '--env-file',
    envPath,
    '-e',
    'HOSTNAME=0.0.0.0',
    '-p',
    '127.0.0.1::3000',
    image,
  );
  const port = JSON.parse(docker('inspect', name, '--format', '{{json .NetworkSettings.Ports}}'))[
    '3000/tcp'
  ][0].HostPort;
  let healthy = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const response = await fetch('http://127.0.0.1:' + port + '/api/health', {
        signal: AbortSignal.timeout(2000),
      });
      if (response.ok && (await response.json()).status === 'ok') {
        healthy = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  assert.ok(healthy, 'container must serve health as an unprivileged user');
  assert.equal(
    (await fetch('http://127.0.0.1:' + port + '/api/ready')).status,
    503,
    'dummy DB credentials must not claim readiness',
  );
  const invalid = spawnSync(
    'docker',
    [
      'run',
      '--rm',
      '--env-file',
      envPath,
      '-e',
      'DEPLOYMENT_ENV=production',
      '-e',
      'HOSTNAME=0.0.0.0',
      image,
    ],
    { encoding: 'utf8', timeout: 30000 },
  );
  assert.equal(invalid.status, 1, 'production must refuse HTTP configuration before listen');
  assert.match(invalid.stderr, /Invalid server configuration/);
  writeFileSync(
    qaPath('evidence/docker-runtime.json'),
    JSON.stringify(
      {
        status: 'PASS',
        image,
        revision: labels['org.opencontainers.image.revision'],
        checks: [
          'non-root user',
          'read-only filesystem runtime',
          'health 200',
          'unavailable DB returns readiness 503',
          'production HTTP configuration exits before listen',
          'OCI source/version/revision',
        ],
        scope:
          'Container runtime with intentionally invalid DB credentials; real DB paths verified separately by production E2E',
      },
      null,
      2,
    ),
  );
  console.log(
    'PASS: non-root Docker runtime, OCI labels, readiness failure and unsafe startup rejection.',
  );
} finally {
  spawnSync('docker', ['rm', '-f', name], { stdio: 'ignore' });
  rmSync(envPath, { force: true });
}
