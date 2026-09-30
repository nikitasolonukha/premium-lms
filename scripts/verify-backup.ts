import { readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import pg from 'pg';
import { verifyBackup } from '../src/lib/backup';
const args = process.argv.slice(2);
if (
  args.some(
    (arg) =>
      !arg.startsWith('--manifest=') &&
      !['--check-archive', '--verify-restored-db', '--verify-restored-storage'].includes(arg),
  )
)
  throw new Error(
    'Use --manifest=<file> [--check-archive] [--verify-restored-db] [--verify-restored-storage]',
  );
const manifestPath = args.find((arg) => arg.startsWith('--manifest='))?.slice(11);
if (!manifestPath) throw new Error('An explicit --manifest=<file> is required');
const migrations = readdirSync('supabase/migrations')
  .filter((name) => /^\d{14}_.+\.sql$/.test(name))
  .map((name) => name.slice(0, 14))
  .sort();
try {
  const result = await verifyBackup(manifestPath, migrations),
    manifest = result.manifest;
  let archive = 'UNVERIFIED',
    restoredDatabase = 'UNVERIFIED',
    restoredStorage = 'UNVERIFIED';
  if (args.includes('--check-archive')) {
    const toc = execFileSync('pg_restore', ['--list', result.dumpPath], {
      encoding: 'utf8',
      timeout: 30000,
      maxBuffer: 16 * 1024 * 1024,
    });
    if (
      !toc.includes('Dumped from database version: ' + manifest.database.serverVersion) ||
      !toc.includes('Dumped by pg_dump version: ' + manifest.database.dumpToolVersion)
    )
      throw new Error('Archive PostgreSQL version differs from manifest');
    archive = 'PASS';
  }
  if (args.includes('--verify-restored-db')) {
    if (!process.env.DATABASE_URL) throw new Error('Operator DATABASE_URL is required');
    const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await db.connect();
    try {
      await db.query('begin read only');
      await db.query("set local statement_timeout='5s'");
      const versions = (
        await db.query('select version from supabase_migrations.schema_migrations order by version')
      ).rows.map((row) => row.version);
      if (JSON.stringify(versions) !== JSON.stringify(manifest.database.migrations))
        throw new Error('Restored migration versions differ');
      if (!String((await db.query('show server_version')).rows[0].server_version).startsWith('17.'))
        throw new Error('Restored PostgreSQL major version differs');
      const objects = (
        await db.query(
          'select bucket_id,name from storage.objects where bucket_id=any($1::text[]) order by bucket_id,name',
          [manifest.storage.buckets],
        )
      ).rows;
      const expected = manifest.storage.objects
        .map((object) => object.bucket + '/' + object.key)
        .sort();
      if (
        JSON.stringify(objects.map((object) => object.bucket_id + '/' + object.name).sort()) !==
        JSON.stringify(expected)
      )
        throw new Error('Restored Storage metadata differs');
      await db.query('rollback');
      restoredDatabase = 'PASS';
    } finally {
      await db.end();
    }
  }
  if (args.includes('--verify-restored-storage')) {
    const origin = new URL(process.env.SUPABASE_URL ?? '');
    if (
      origin.username ||
      origin.password ||
      origin.search ||
      origin.hash ||
      origin.pathname !== '/' ||
      (origin.protocol !== 'https:' &&
        !(origin.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(origin.hostname)))
    )
      throw new Error('Invalid operator Storage origin');
    const key = process.env.SUPABASE_SECRET_KEY;
    if (!key) throw new Error('Operator Storage key is required');
    for (const object of manifest.storage.objects) {
      const path = [object.bucket, ...object.key.split('/')].map(encodeURIComponent).join('/');
      const response = await fetch(new URL('/storage/v1/object/authenticated/' + path, origin), {
        headers: { apikey: key, Authorization: 'Bearer ' + key },
        redirect: 'error',
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok || !response.body) throw new Error('Restored Storage object unavailable');
      const digest = createHash('sha256'),
        reader = response.body.getReader();
      let size = 0;
      try {
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > object.sizeBytes) {
            await reader.cancel();
            throw new Error('Restored object size mismatch');
          }
          digest.update(chunk.value);
        }
      } finally {
        reader.releaseLock();
      }
      if (size !== object.sizeBytes || digest.digest('hex') !== object.sha256)
        throw new Error('Restored Storage checksum mismatch');
    }
    restoredStorage = 'PASS';
  }
  console.log(
    JSON.stringify(
      {
        files: 'PASS',
        archive,
        restoredDatabase,
        restoredStorage,
        consistencyDeclaration: manifest.consistency,
        objectCount: result.objectCount,
        totalBytes: result.totalBytes,
        migrationVersion: result.migrationVersion,
        scope:
          'Read-only verification; no database or Storage modifications. Restore execution and functional UAT are separate gates.',
      },
      null,
      2,
    ),
  );
} catch {
  console.error(
    'FAIL: backup verification did not complete. Check manifest versions, timestamps, regular file paths, inventory and SHA256; optional target/tool configuration must be valid. No secrets or backup contents were logged.',
  );
  process.exitCode = 1;
}
