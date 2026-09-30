import { it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { verifyBackup, type BackupManifest } from '../../src/lib/backup';

it('verifies every dump/storage byte, count and migration; rejects corruption, traversal and inconsistent metadata', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lms-backup-'));
  const dump = Buffer.from('PGDMP\x01safe fixture'), object = Buffer.from('material bytes');
  const hash = (value: Buffer) => createHash('sha256').update(value).digest('hex');
  const when = new Date(Date.now() - 1000).toISOString();
  const manifest: BackupManifest = {
    schemaVersion: 1, createdAt: when, consistency: 'quiesced',
    application: { version: '1.0.0', commit: 'a'.repeat(40) },
    database: { file: 'database.dump', format: 'pg_dump-custom', capturedAt: when, serverVersion: '17.6', dumpToolVersion: '17.6', migrations: ['20260930102026'], sizeBytes: dump.length, sha256: hash(dump) },
    storage: { capturedAt: when, buckets: ['academy-private'], objectCount: 1, totalBytes: object.length, objects: [{ bucket: 'academy-private', key: 'owner/asset', file: 'storage/academy-private/owner/asset', contentType: 'application/pdf', sizeBytes: object.length, sha256: hash(object) }] },
  };
  try {
    await mkdir(join(root, 'storage/academy-private/owner'), { recursive: true });
    await writeFile(join(root, 'database.dump'), dump);
    await writeFile(join(root, manifest.storage.objects[0].file), object);
    const writeManifest = async (value: unknown) => { await writeFile(join(root, 'backup-manifest.json'), JSON.stringify(value)); };
    await writeManifest(manifest);
    expect(await verifyBackup(join(root, 'backup-manifest.json'), ['20260930102026'])).toMatchObject({ status: 'PASS', objectCount: 1 });
    await writeFile(join(root, manifest.storage.objects[0].file), 'corrupted data');
    await expect(verifyBackup(join(root, 'backup-manifest.json'), ['20260930102026'])).rejects.toThrow();
    await writeFile(join(root, manifest.storage.objects[0].file), object);
    for (const mutated of [
      { ...manifest, schemaVersion: 2 },
      { ...manifest, createdAt: '2099-01-01T00:00:00Z' },
      { ...manifest, database: { ...manifest.database, serverVersion: '15.19' } },
      { ...manifest, database: { ...manifest.database, migrations: ['20260930100000'] } },
      { ...manifest, storage: { ...manifest.storage, objectCount: 2 } },
      { ...manifest, storage: { ...manifest.storage, totalBytes: 0 } },
      { ...manifest, storage: { ...manifest.storage, objects: [{ ...manifest.storage.objects[0], file: '../../outside' }] } },
    ]) { await writeManifest(mutated); await expect(verifyBackup(join(root, 'backup-manifest.json'), ['20260930102026'])).rejects.toThrow(); }
    await writeManifest(manifest);
    await writeFile(join(root, 'storage/academy-private/unlisted'), 'orphan');
    await expect(verifyBackup(join(root, 'backup-manifest.json'), ['20260930102026'])).rejects.toThrow('inventory');
  } finally { await rm(root, { recursive: true, force: true }); }
});
