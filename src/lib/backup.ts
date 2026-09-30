import { z } from 'zod';
import { lstat, readFile, readdir, open } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve, relative, sep } from 'node:path';

const pathName = z
  .string()
  .min(1)
  .max(1024)
  .refine(
    (value) =>
      value === value.normalize('NFC') &&
      !/[\\:\x00-\x1f\x7f]/.test(value) &&
      value
        .split('/')
        .every((part) => part && part !== '.' && part !== '..' && !/[. ]$/.test(part)),
  );
const hash = z.string().regex(/^[a-f0-9]{64}$/),
  bytes = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const version = z
  .string()
  .max(120)
  .regex(/^17\.\d+(?:[.\w ()+-]*)$/);
export const backupManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    createdAt: z.iso.datetime({ offset: true }),
    consistency: z.enum(['quiesced', 'best-effort']),
    application: z
      .object({
        version: z.string().regex(/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/),
        commit: z.string().regex(/^[a-f0-9]{40}$/),
      })
      .strict(),
    database: z
      .object({
        file: pathName,
        format: z.literal('pg_dump-custom'),
        capturedAt: z.iso.datetime({ offset: true }),
        serverVersion: version,
        dumpToolVersion: version,
        migrations: z
          .array(z.string().regex(/^\d{14}$/))
          .min(1)
          .max(10000),
        sizeBytes: bytes,
        sha256: hash,
      })
      .strict(),
    storage: z
      .object({
        capturedAt: z.iso.datetime({ offset: true }),
        buckets: z
          .array(z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/))
          .min(1)
          .max(100),
        objectCount: bytes,
        totalBytes: bytes,
        objects: z
          .array(
            z
              .object({
                bucket: z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/),
                key: pathName,
                file: pathName,
                contentType: z
                  .string()
                  .min(1)
                  .max(150)
                  .regex(/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i),
                sizeBytes: bytes,
                sha256: hash,
              })
              .strict(),
          )
          .max(100000),
      })
      .strict(),
  })
  .strict();
export type BackupManifest = z.infer<typeof backupManifestSchema>;

async function containedFile(root: string, path: string) {
  const target = resolve(root, path),
    rel = relative(root, target);
  if (!rel || rel.startsWith('..' + sep) || rel === '..' || resolve(target) === resolve(root))
    throw new Error('Invalid backup path');
  let current = root;
  const parts = path.split('/');
  for (const [index, part] of parts.entries()) {
    current = join(current, part);
    const entry = await lstat(current);
    if (
      entry.isSymbolicLink() ||
      (index < parts.length - 1 ? !entry.isDirectory() : !entry.isFile())
    )
      throw new Error('Backup paths must be regular files without symlinks');
  }
  return target;
}
async function inventory(path: string, prefix = ''): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const key = prefix + entry.name;
    if (entry.isSymbolicLink()) throw new Error('Backup inventory contains a symlink');
    if (entry.isDirectory()) result.push(...(await inventory(join(path, entry.name), key + '/')));
    else if (entry.isFile()) result.push(key);
    else throw new Error('Backup inventory contains an unsupported object');
  }
  return result.sort();
}
export async function verifyFile(path: string, expectedBytes: number, expectedHash: string) {
  const before = await lstat(path);
  if (!before.isFile() || before.isSymbolicLink() || before.size !== expectedBytes)
    throw new Error('Backup size mismatch');
  const digest = createHash('sha256');
  let size = 0;
  for await (const chunk of createReadStream(path)) {
    size += chunk.length;
    if (size > expectedBytes) throw new Error('Backup changed during verification');
    digest.update(chunk);
  }
  const after = await lstat(path);
  if (
    size !== expectedBytes ||
    digest.digest('hex') !== expectedHash ||
    before.mtimeMs !== after.mtimeMs ||
    before.size !== after.size
  )
    throw new Error('Backup SHA256 mismatch or concurrent modification');
}
export async function verifyBackup(manifestPath: string, expectedMigrations: string[]) {
  const location = resolve(manifestPath),
    root = dirname(location),
    stat = await lstat(location);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 32 * 1024 * 1024)
    throw new Error('Invalid backup manifest file');
  const parsed = backupManifestSchema.safeParse(JSON.parse(await readFile(location, 'utf8')));
  if (!parsed.success) throw new Error('Invalid backup manifest metadata');
  const manifest = parsed.data,
    created = Date.parse(manifest.createdAt);
  if (
    created > Date.now() + 300000 ||
    [manifest.database.capturedAt, manifest.storage.capturedAt].some(
      (time) => Date.parse(time) > created || Date.parse(time) < Date.parse('2020-01-01T00:00:00Z'),
    )
  )
    throw new Error('Invalid backup timestamps');
  const migrations = manifest.database.migrations;
  if (
    JSON.stringify(migrations) !== JSON.stringify([...new Set(migrations)].sort()) ||
    JSON.stringify(migrations) !== JSON.stringify(expectedMigrations)
  )
    throw new Error('Backup migration version does not match this release');
  if (new Set(manifest.storage.buckets).size !== manifest.storage.buckets.length)
    throw new Error('Duplicate backup bucket');
  const objects = manifest.storage.objects,
    paths = new Set<string>();
  let totalBytes = 0;
  for (const object of objects) {
    const path = object.file.toLowerCase();
    if (
      !manifest.storage.buckets.includes(object.bucket) ||
      object.file !== 'storage/' + object.bucket + '/' + object.key ||
      paths.has(path)
    )
      throw new Error('Invalid or duplicate storage inventory path');
    paths.add(path);
    totalBytes += object.sizeBytes;
    if (!Number.isSafeInteger(totalBytes)) throw new Error('Invalid backup byte count');
  }
  if (objects.length !== manifest.storage.objectCount || totalBytes !== manifest.storage.totalBytes)
    throw new Error('Backup inventory count mismatch');
  const storageDirectory = await lstat(join(root, 'storage'));
  if (!storageDirectory.isDirectory() || storageDirectory.isSymbolicLink())
    throw new Error('Storage inventory root must be a regular directory');
  const actual = await inventory(join(root, 'storage'));
  if (
    JSON.stringify(actual) !==
    JSON.stringify(objects.map((object) => object.file.slice('storage/'.length)).sort())
  )
    throw new Error('Storage inventory differs from manifest');
  const dumpPath = await containedFile(root, manifest.database.file);
  if (manifest.database.file.startsWith('storage/'))
    throw new Error('Database dump overlaps storage inventory');
  await verifyFile(dumpPath, manifest.database.sizeBytes, manifest.database.sha256);
  const dump = await open(dumpPath, 'r');
  try {
    const header = Buffer.alloc(5);
    await dump.read(header, 0, 5, 0);
    if (header.toString('ascii') !== 'PGDMP') throw new Error('Expected a pg_dump custom archive');
  } finally {
    await dump.close();
  }
  for (const object of objects)
    await verifyFile(await containedFile(root, object.file), object.sizeBytes, object.sha256);
  return {
    status: 'PASS' as const,
    objectCount: objects.length,
    totalBytes,
    migrationVersion: migrations.at(-1)!,
    manifest,
    dumpPath,
  };
}
