import { fromBufferPromise } from 'yauzl';
import { allowedFiles, validateFile, validateFilename } from './files';

const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit++) crc = (crc & 1) ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});
function pdfSafety(bytes: Uint8Array) {
  // PDF names permit #XX escapes. Encrypted and compressed-object PDFs cannot
  // be inspected by this deliberately conservative gate and are rejected.
  const text = Buffer.from(bytes).toString('latin1').replace(/#[a-f0-9]{2}/gi, value => String.fromCharCode(parseInt(value.slice(1), 16)));
  if (/\/(JavaScript|JS|Launch|EmbeddedFile|OpenAction|AA|RichMedia|XFA|SubmitForm|ImportData|GoToR|GoToE|Encrypt|ObjStm)(?=[\s/<>()[\]{}%]|$)/i.test(text))
    throw new Error('PDF содержит активные элементы или защищённую структуру. Экспортируйте PDF без шифрования, сценариев и сжатых объектов.');
}
export async function inspectUpload(bytes: Uint8Array, mime: string, filename: string): Promise<void> {
  validateFilename(filename);
  if (!allowedFiles[mime]?.includes(filename.split('.').at(-1)?.toLowerCase() ?? '')) throw new Error('Расширение не соответствует типу файла');
  validateFile(bytes, mime);
  if (mime === 'application/pdf') pdfSafety(bytes);
  if (!mime.includes('openxmlformats') && mime !== 'application/zip') return;
  const zip = await fromBufferPromise(Buffer.from(bytes), { lazyEntries: true, strictFileNames: true, validateEntrySizes: true });
  const names = new Set<string>();
  let total = 0, count = 0;
  const deadline = Date.now() + 15000;
  try {
    for await (const entry of zip.eachEntry()) {
      const name = entry.fileName.normalize('NFC'), normalized = name.toLowerCase();
      const unixType = (entry.externalFileAttributes >>> 16) & 0xf000;
      if (++count > 2000 || Date.now() > deadline || entry.isEncrypted() || unixType === 0xa000 || names.has(normalized)
        || /[\x00-\x1f\x7f:\\]/.test(name) || name.length > 1024 || name.startsWith('/')
        || name.split('/').some(part => part === '..' || part === '.' || /[. ]$/.test(part))
        || /(?:vbaProject\.bin|\.(?:exe|com|dll|scr|bat|cmd|ps1|vbs|js|msi|jar|lnk|iso|zip|7z|rar|gz|tgz|tar))$/i.test(name))
        throw new Error('Небезопасное содержимое архива');
      names.add(normalized);
      if (entry.uncompressedSize > 52428800 || entry.uncompressedSize / Math.max(1, entry.compressedSize) > 200)
        throw new Error('Слишком высокая степень сжатия или размер архива');
      const stream = await zip.openReadStreamPromise(entry);
      let size = 0, crc = 0xffffffff;
      const inspectText = /(?:\.xml|\.rels|\.pdf)$/i.test(name), parts: Buffer[] = [];
      try {
        for await (const chunk of stream) {
          const buffer = Buffer.from(chunk);
          size += buffer.length; total += buffer.length;
          if (size > 52428800 || total > 209715200 || size > entry.uncompressedSize || Date.now() > deadline)
            throw new Error('Превышен лимит распаковки архива');
          for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
          if (inspectText) parts.push(buffer);
        }
      } finally { stream.destroy(); }
      if (size !== entry.uncompressedSize || ((crc ^ 0xffffffff) >>> 0) !== entry.crc32) throw new Error('Контрольная сумма архива не совпадает');
      if (inspectText) {
        const content = Buffer.concat(parts);
        if (/\.pdf$/i.test(name)) { validateFile(content, 'application/pdf'); pdfSafety(content); }
        else if (/macroEnabled|vbaProject|<!ENTITY|<!DOCTYPE|<[^>]*(?:ddeLink|oleObject)/i.test(content.toString('utf8')) || content.includes(0))
          throw new Error('Документ содержит макросы, внешние объекты или неподдерживаемый XML');
      }
    }
  } finally { zip.close(); }
}
