import { expect, it } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { inspectUpload } from '../../src/lib/upload-inspection';
it('reads actual ZIP bytes and rejects CRC corruption, truncated archives and spoofed sizes', async () => {
  const original = Buffer.from(zipSync({ 'notes.txt': strToU8('original bytes') }, { level: 0 }));
  await expect(
    inspectUpload(original, 'application/zip', 'Материалы.zip'),
  ).resolves.toBeUndefined();
  const corrupted = Buffer.from(original);
  corrupted[30 + 'notes.txt'.length] ^= 1;
  await expect(inspectUpload(corrupted, 'application/zip', 'file.zip')).rejects.toThrow();
  await expect(
    inspectUpload(original.subarray(0, -10), 'application/zip', 'file.zip'),
  ).rejects.toThrow();
  const lying = Buffer.from(
    zipSync({ 'large.txt': strToU8('some text with moderate compression '.repeat(200)) }),
  );
  const central = lying.indexOf(Buffer.from([80, 75, 1, 2]));
  lying.writeUInt32LE(1, central + 24);
  await expect(inspectUpload(lying, 'application/zip', 'file.zip')).rejects.toThrow();
});
it('rejects ZIP bombs, macros, path traversal, nested archives and executable attachments', async () => {
  const payloads: Record<string, Uint8Array>[] = [
    { 'bomb.txt': new Uint8Array(1048576) },
    { '../outside.txt': strToU8('x') },
    { 'word/vbaProject.bin': strToU8('macro') },
    { 'program.exe': strToU8('MZ') },
    { 'nested.zip': zipSync({ 'file.txt': strToU8('x') }) },
  ];
  for (const payload of payloads)
    await expect(inspectUpload(zipSync(payload), 'application/zip', 'file.zip')).rejects.toThrow();
});
it('rejects MIME/extension mismatch and escaped PDF actions or uninspectable PDFs', async () => {
  const pdf = (text: string) => Buffer.from(`%PDF-1.7\n1 0 obj << ${text} >> endobj\n%%EOF`);
  await expect(
    inspectUpload(pdf('/Type /Catalog'), 'application/pdf', 'file.exe'),
  ).rejects.toThrow();
  for (const value of ['/Open#41ction', '/J#53', '/Java#53cript', '/Encrypt', '/Type /Ob#6aStm'])
    await expect(inspectUpload(pdf(value), 'application/pdf', 'file.pdf')).rejects.toThrow();
  await expect(
    inspectUpload(pdf('/Type /Catalog'), 'application/pdf', 'file.pdf'),
  ).resolves.toBeUndefined();
});
