import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { validateFile, validateFilename, formatBytes } from '../../src/lib/files';
describe('private upload validation', () => {
  it('handles image signatures, empty input and unexpected MIME', () => {
    expect(validateFile(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), 'image/png')).toBe(true);
    expect(validateFile(Buffer.from([255, 216, 255, 1]), 'image/jpeg')).toBe(true);
    expect(validateFile(Buffer.from('RIFF1234WEBP'), 'image/webp')).toBe(true);
    for (const [bytes, mime] of [
      [Buffer.alloc(0), 'application/pdf'],
      [Buffer.from('plain'), 'text/html'],
      [Buffer.from('fake'), 'application/zip'],
    ] as const)
      expect(() => validateFile(bytes, mime)).toThrow();
    expect(formatBytes(1024)).toBe('1 КБ');
    expect(formatBytes(1048576)).toBe('1.0 МБ');
  });
  it('accepts ZIP and workbook structures and rejects macros and excessive entries', () => {
    expect(validateFile(zipSync({ 'file.txt': strToU8('text') }), 'application/zip')).toBe(true);
    expect(
      validateFile(
        zipSync({
          '[Content_Types].xml': strToU8('<Types/>'),
          'xl/workbook.xml': strToU8('<workbook/>'),
        }),
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ),
    ).toBe(true);
    expect(() =>
      validateFile(zipSync({ 'word/vbaProject.bin': strToU8('macro') }), 'application/zip'),
    ).toThrow();
    expect(() =>
      validateFile(
        zipSync(
          Object.fromEntries(Array.from({ length: 2001 }, (_, i) => [`${i}.txt`, strToU8('a')])),
        ),
        'application/zip',
      ),
    ).toThrow();
  });
  it('preserves Cyrillic and rejects paths, controls and excessive names', () => {
    expect(validateFilename('План обучения.pdf')).toBe('План обучения.pdf');
    for (const value of ['../test.pdf', 'a\\b.pdf', 'test\n.pdf', 'a'.repeat(241), ''])
      expect(() => validateFilename(value)).toThrow();
  });
  it('detects renamed executables, active PDFs and malformed files', () => {
    expect(() => validateFile(Buffer.from('MZ executable'), 'image/png')).toThrow();
    expect(() =>
      validateFile(Buffer.from('%PDF-1.7 /JavaScript evil %%EOF'), 'application/pdf'),
    ).toThrow();
    expect(() => validateFile(Buffer.from('%PDF-1.7 broken'), 'application/pdf')).toThrow();
    expect(
      validateFile(
        Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF'),
        'application/pdf',
      ),
    ).toBe(true);
  });
  it('validates office archive structure and rejects archive traversal', () => {
    const doc = zipSync({
      '[Content_Types].xml': strToU8('<Types/>'),
      'word/document.xml': strToU8('<document/>'),
    });
    expect(
      validateFile(doc, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
    ).toBe(true);
    expect(() =>
      validateFile(doc, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
    ).toThrow();
    expect(() =>
      validateFile(zipSync({ '../escape.txt': strToU8('bad') }), 'application/zip'),
    ).toThrow();
  });
});
