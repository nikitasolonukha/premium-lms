import pg from 'pg';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { resolve, dirname, basename, sep } from 'node:path';
import assert from 'node:assert/strict';
import { backupManifestSchema, verifyBackup } from '../src/lib/backup';
import { qaPath, qaRoot } from './qa-paths.mjs';
if (
  process.env.SUPABASE_URL !== 'http://127.0.0.1:56321' ||
  new URL(process.env.DATABASE_URL!).port !== '56322'
)
  throw new Error('Backup fixture is restricted to local QA');
const root = resolve('.local/backups', basename(qaRoot)),
  db = new pg.Client({ connectionString: process.env.DATABASE_URL });
mkdirSync(root, { recursive: true });
mkdirSync(resolve(root, 'storage'), { recursive: true });
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
await db.connect();
try {
  const capturedAt = new Date().toISOString();
  const serverVersion = String((await db.query('show server_version')).rows[0].server_version);
  const versions = (
    await db.query('select version from supabase_migrations.schema_migrations order by version')
  ).rows.map((row) => row.version);
  const toolVersion = execFileSync(
    'docker',
    ['exec', 'supabase_db_premium-lms-local', 'pg_dump', '--version'],
    { encoding: 'utf8', timeout: 30000 },
  ).match(/17\.[\d.]+/)![0];
  const dump = execFileSync(
    'docker',
    [
      'exec',
      'supabase_db_premium-lms-local',
      'pg_dump',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-Fc',
      '--schema=public',
      '--schema=private',
      '--schema=auth',
      '--schema=storage',
      '--schema=supabase_migrations',
    ],
    { timeout: 60000, maxBuffer: 100 * 1024 * 1024 },
  );
  writeFileSync(resolve(root, 'database.dump'), dump, { mode: 0o600, flag: 'wx' });
  const toc = execFileSync(
    'docker',
    ['exec', '-i', 'supabase_db_premium-lms-local', 'pg_restore', '--list'],
    { input: dump, timeout: 30000, maxBuffer: 16 * 1024 * 1024 },
  ).toString('utf8');
  assert.ok(toc.includes('Dumped from database version: ' + serverVersion));
  assert.ok(toc.includes('Dumped by pg_dump version: ' + toolVersion));
  const buckets = (await db.query('select id from storage.buckets order by id')).rows.map(
    (row) => row.id,
  );
  const rows = (
    await db.query('select bucket_id,name,metadata from storage.objects order by bucket_id,name')
  ).rows;
  const objects = [];
  for (const row of rows) {
    const path = [row.bucket_id, ...row.name.split('/')].map(encodeURIComponent).join('/');
    const response: Response = await fetch(
      new URL('/storage/v1/object/authenticated/' + path, process.env.SUPABASE_URL),
      {
        headers: {
          apikey: process.env.SUPABASE_SECRET_KEY!,
          Authorization: 'Bearer ' + process.env.SUPABASE_SECRET_KEY,
        },
        redirect: 'error',
        signal: AbortSignal.timeout(10000),
      },
    );
    assert.equal(response.ok, true, 'local object backup must download');
    const bytes = Buffer.from(await response.arrayBuffer());
    const file = 'storage/' + row.bucket_id + '/' + row.name,
      target = resolve(root, file);
    assert.ok(target.startsWith(root + sep));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes, { mode: 0o600, flag: 'wx' });
    objects.push({
      bucket: row.bucket_id,
      key: row.name,
      file,
      contentType: response.headers.get('content-type')!.split(';')[0],
      sizeBytes: bytes.length,
      sha256: hash(bytes),
    });
  }
  const manifest = backupManifestSchema.parse({
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    consistency: 'best-effort',
    application: {
      version: JSON.parse(readFileSync('package.json', 'utf8')).version,
      commit: execFileSync(
        'git',
        ['-c', 'safe.directory=' + process.cwd().replaceAll('\\', '/'), 'rev-parse', 'HEAD'],
        { encoding: 'utf8' },
      ).trim(),
    },
    database: {
      file: 'database.dump',
      format: 'pg_dump-custom',
      capturedAt,
      serverVersion,
      dumpToolVersion: toolVersion,
      migrations: versions,
      sizeBytes: dump.length,
      sha256: hash(dump),
    },
    storage: {
      capturedAt,
      buckets,
      objectCount: objects.length,
      totalBytes: objects.reduce((sum, object) => sum + object.sizeBytes, 0),
      objects,
    },
  });
  const manifestPath = resolve(root, 'backup-manifest.json');
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), { mode: 0o600, flag: 'wx' });
  const expected = readdirSync('supabase/migrations')
    .filter((name) => /^\d{14}_/.test(name))
    .map((name) => name.slice(0, 14))
    .sort();
  const verified = await verifyBackup(manifestPath, expected);
  assert.equal(verified.objectCount, rows.length);
  writeFileSync(
    qaPath('evidence/backup-verification.json'),
    JSON.stringify(
      {
        status: 'PASS',
        objectCount: verified.objectCount,
        totalBytes: verified.totalBytes,
        migrationVersion: verified.migrationVersion,
        checks: [
          'real local pg_dump custom archive',
          'pg_restore TOC and version validation',
          'every physical Storage object downloaded',
          'every byte SHA256 and complete file inventory',
          'migration versions match this release',
        ],
        scope:
          'Read-only source snapshot / verifier test; isolated restoration and functional staging UAT remain UNVERIFIED. Private dump and manifest are gitignored.',
        consistencyDeclaration: 'best-effort',
      },
      null,
      2,
    ),
  );
  console.log(
    'PASS: local archive and complete Storage inventory verified; no database/Storage writes performed.',
  );
} finally {
  await db.end();
}
