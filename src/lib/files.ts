import { unzipSync } from 'fflate';
export const allowedFiles: Record<string, string[]> = {
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
  'application/pdf': ['pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['xlsx'],
  'application/zip': ['zip'],
};
export function validateFilename(name: string): string {
  if (
    !name.trim() ||
    name.length > 240 ||
    /[\x00-\x1f\x7f/\\]/.test(name) ||
    name === '.' ||
    name === '..'
  )
    throw new Error('Недопустимое имя файла');
  return name.normalize('NFC');
}
export function validateFile(bytes: Uint8Array, mime: string): true {
  if (!bytes.length || bytes.length > 52428800 || !(mime in allowedFiles))
    throw new Error('Недопустимый тип или размер файла');
  const head = Buffer.from(bytes.subarray(0, 12));
  if (
    mime === 'image/png' &&
    head.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return true;
  if (mime === 'image/jpeg' && head[0] === 255 && head[1] === 216 && head[2] === 255) return true;
  if (
    mime === 'image/webp' &&
    head.toString('ascii', 0, 4) === 'RIFF' &&
    head.toString('ascii', 8, 12) === 'WEBP'
  )
    return true;
  if (mime === 'application/pdf') {
    const text = Buffer.from(bytes).toString('latin1');
    if (
      text.startsWith('%PDF-') &&
      text.slice(-2048).includes('%%EOF') &&
      !/\/(JavaScript|JS|Launch|EmbeddedFile|OpenAction|AA)\b/i.test(text)
    )
      return true;
  }
  if (mime.includes('openxmlformats') || mime === 'application/zip') {
    if (head[0] !== 80 || head[1] !== 75 || head[2] !== 3 || head[3] !== 4)
      throw new Error('Некорректный архив');
    let total = 0,
      count = 0;
    const names: string[] = [];
    unzipSync(bytes, {
      filter: (file) => {
        if (
          file.name.startsWith('/') ||
          file.name.includes('\\') ||
          file.name.split('/').includes('..') ||
          /vbaProject\.bin$/i.test(file.name)
        )
          throw new Error('Небезопасное содержимое архива');
        total += file.originalSize;
        count++;
        if (total > 209715200 || file.originalSize > 52428800 || count > 2000)
          throw new Error('Слишком большой распакованный архив');
        names.push(file.name);
        return false;
      },
    });
    if (mime === 'application/zip') return true;
    if (
      names.includes('[Content_Types].xml') &&
      names.includes(mime.includes('wordprocessing') ? 'word/document.xml' : 'xl/workbook.xml')
    )
      return true;
  }
  throw new Error('Содержимое файла не соответствует заявленному типу');
}
export function formatBytes(bytes: number) {
  return bytes < 1048576
    ? `${Math.max(1, Math.round(bytes / 1024))} КБ`
    : `${(bytes / 1048576).toFixed(1)} МБ`;
}
