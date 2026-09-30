'use client';
import { useId, useRef, useState } from 'react';
import { FileText, UploadCloud } from 'lucide-react';
import { createUpload, finalizeUpload } from '@/lib/actions/media';
import { allowedFiles } from '@/lib/files';
import { Button } from './ui';
export function Uploader({
  id: providedId,
  value,
  onChange,
  purpose = 'course',
  imagesOnly = false,
  label = 'Загрузить файл',
}: {
  id?: string;
  value?: string | null;
  onChange: (id: string, filename: string) => void;
  purpose?: 'course' | 'avatar' | 'branding';
  imagesOnly?: boolean;
  label?: string;
}) {
  const input = useRef<HTMLInputElement>(null),
    inFlight = useRef(false),
    generatedId = useId(),
    id = providedId ?? generatedId;
  const [busy, setBusy] = useState(false),
    [stage, setStage] = useState(''),
    [error, setError] = useState('');
  async function upload(file: File) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    setStage('Подготавливаем загрузку…');
    try {
      const extension = file.name.split('.').at(-1)?.toLowerCase(),
        mime =
          Object.entries(allowedFiles).find(([, ext]) => ext.includes(extension ?? ''))?.[0] ??
          file.type;
      const begin = await createUpload({
        id: crypto.randomUUID(),
        filename: file.name,
        mime,
        size: file.size,
        purpose,
      });
      if (!begin.ok || !begin.data)
        throw new Error(!begin.ok ? begin.error : 'Не удалось начать загрузку');
      setStage('Загружаем файл…');
      const sent = await fetch(begin.data.url, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': mime, 'x-upsert': 'false' },
      });
      if (!sent.ok) throw new Error('Загрузка прервана. Проверьте соединение и повторите попытку.');
      setStage('Проверяем содержимое…');
      const finish = await finalizeUpload(begin.data.id);
      if (!finish.ok || !finish.data)
        throw new Error(!finish.ok ? finish.error : 'Не удалось проверить файл');
      onChange(finish.data.id, finish.data.filename);
      setStage('Файл загружен');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
    } finally {
      inFlight.current = false;
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }
  return (
    <div className="upload-field">
      {value && imagesOnly ? (
        <img src={`/api/media/${value}`} alt="Загруженное изображение" />
      ) : value ? (
        <FileText size={27} />
      ) : (
        <UploadCloud size={27} />
      )}
      <input
        ref={input}
        id={id}
        type="file"
        className="sr-only"
        aria-label={label}
        accept={
          imagesOnly ? '.jpg,.jpeg,.png,.webp' : '.pdf,.docx,.xlsx,.zip,.jpg,.jpeg,.png,.webp'
        }
        disabled={busy}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
        }}
      />
      <Button variant="secondary" type="button" busy={busy} onClick={() => input.current?.click()}>
        {value ? 'Заменить файл' : label}
      </Button>
      <p>
        {imagesOnly
          ? 'JPG, PNG или WebP · до 5 МБ для профиля и бренда'
          : 'PDF, DOCX, XLSX, ZIP или изображения · до 50 МБ'}
      </p>
      {stage && (
        <span className="upload-progress" role="status">
          {stage}
        </span>
      )}
      {error && (
        <span className="field-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
