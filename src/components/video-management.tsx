'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createVideo, queueVideo, operationCommand, videoList } from '@/lib/actions/operations';
import { type VideoJob, statusLabels, operationErrors } from '@/lib/operations';
import { Button, Field, Input, Badge } from './ui';
import { ConfirmDialog } from './confirm-dialog';
import { formatBytes } from '@/lib/files';
import { toast } from 'sonner';
export function VideoManagement({ jobs, brand }: { jobs: VideoJob[]; brand: string }) {
  const [busy, start] = useTransition(),
    [upload, setUpload] = useState<number | null>(null),
    [error, setError] = useState(''),
    [pendingId, setPendingId] = useState('');
  const request = useRef<XMLHttpRequest | null>(null),
    router = useRouter();
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (!jobs.some((j) => ['queued', 'running'].includes(j.status))) return;
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, 10000);
    return () => clearInterval(t);
  }, [jobs, router]);
  return (
    <div className="form-stack">
      <form
        className="ops-panel ops-body form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget),
            file = f.get('video');
          if (!(file instanceof File) || !file.size || file.size > 1073741824) {
            setError('Выберите MP4 до 1 ГБ.');
            return;
          }
          start(async () => {
            setError('');
            const r = await createVideo({
              id: crypto.randomUUID(),
              filename: file.name,
              size: file.size,
              watermark: String(f.get('watermark')),
              download: f.get('download') === 'on',
            });
            if (!r.ok || !r.data) {
              if (!r.ok) setError(r.error);
              return;
            }
            setUpload(0);
            setPendingId(r.data.id);
            const xhr = new XMLHttpRequest();
            request.current = xhr;
            xhr.open('PUT', r.data.url);
            xhr.setRequestHeader('Content-Type', 'video/mp4');
            xhr.timeout = 1800000;
            xhr.upload.onprogress = (event) => {
              if (event.lengthComputable) setUpload(Math.round((event.loaded * 100) / event.total));
            };
            await new Promise<void>((resolve) => {
              xhr.onload = async () => {
                setUpload(null);
                if (xhr.status < 200 || xhr.status >= 300) {
                  setError('Загрузка не завершена. Выберите файл и повторите.');
                  resolve();
                  return;
                }
                const queued = await queueVideo(r.data!.id);
                if (!queued.ok) setError(queued.error);
                else {
                  toast.success('Видео загружено и поставлено в обработку');
                  setPendingId('');
                }
                router.refresh();
                resolve();
              };
              xhr.onerror =
                xhr.ontimeout =
                xhr.onabort =
                  () => {
                    setUpload(null);
                    setError('Загрузка прервана. Выберите файл и повторите.');
                    resolve();
                  };
              xhr.send(file);
            });
          });
        }}
      >
        <h2>Загрузить видео</h2>
        <p>
          MP4 до 1 ГБ и 4 часов. Обработчик вшивает название в кадры, готовит MP4 до 1080p и
          обложку. В урок можно добавить только готовую версию.
        </p>
        <Field label="Видеофайл">
          <Input name="video" type="file" accept=".mp4,video/mp4" required disabled={busy} />
        </Field>
        <Field
          label="Надпись в кадре"
          hint="Будет частью видео, включая полноэкранный просмотр и разрешённое скачивание."
        >
          <Input name="watermark" defaultValue={brand} maxLength={120} required disabled={busy} />
        </Field>
        <label className="ops-check">
          <input name="download" type="checkbox" disabled={busy} />
          Разрешить ученикам скачивать обработанное видео
        </label>
        <div className="form-row">
          <Button busy={busy}>Загрузить и обработать</Button>
          {upload !== null && (
            <Button type="button" variant="secondary" onClick={() => request.current?.abort()}>
              Отменить загрузку
            </Button>
          )}
        </div>
        {upload !== null && (
          <div
            role="progressbar"
            aria-label="Загрузка видео"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={upload}
          >
            Загрузка: {upload}%
          </div>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {pendingId && upload === null && (
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              start(async () => {
                const r = await queueVideo(pendingId);
                if (!r.ok) setError(r.error);
                else {
                  setPendingId('');
                  router.refresh();
                }
              })
            }
          >
            Повторить постановку в обработку
          </Button>
        )}
      </form>
      <div className="ops-actions">
        <h2>Последние 50 видео</h2>
        <Button variant="secondary" onClick={() => router.refresh()}>
          Обновить статусы
        </Button>
      </div>
      {jobs.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Видео</th>
                <th>Статус</th>
                <th>Результат</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id}>
                  <td>
                    {j.filename}
                    <small>{j.download ? 'Скачивание разрешено' : 'Только просмотр'}</small>
                  </td>
                  <td>
                    <Badge tone={j.status === 'failed' ? 'danger' : 'blue'}>
                      {statusLabels[j.status]}
                    </Badge>
                    {j.status === 'running' && <small>{j.progress}%</small>}
                  </td>
                  <td>
                    {j.error_code
                      ? (operationErrors[j.error_code] ?? 'Ошибка')
                      : j.status === 'succeeded'
                        ? `${Math.ceil(Number(j.result.duration) / 60)} мин · ${formatBytes(Number(j.result.size))} · Надпись вшита`
                        : '—'}
                  </td>
                  <td>
                    {j.status === 'succeeded' ? (
                      <div className="ops-actions">
                        <Link
                          className="button button-secondary"
                          href={`/api/media/${j.poster_id}`}
                          target="_blank"
                        >
                          Обложка
                        </Link>
                        <Link
                          className="button button-secondary"
                          href={`/admin/videos/${j.media_id}`}
                        >
                          Просмотр
                        </Link>
                        <Link className="button button-ghost" href="/admin/courses">
                          Добавить в урок
                        </Link>
                      </div>
                    ) : j.status === 'failed' ? (
                      <ConfirmDialog
                        title="Повторить обработку?"
                        description="Исходный файл будет обработан заново с той же надписью."
                        trigger={<Button variant="secondary">Повторить</Button>}
                        onConfirm={async () => {
                          const r = await operationCommand({ op: 'video.retry', id: j.id });
                          if (!r.ok) {
                            toast.error(r.error);
                            return false;
                          }
                          router.refresh();
                        }}
                      />
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>Видео пока не загружены.</p>
      )}
    </div>
  );
}
export function UploadedVideoChoice({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const [q, setQ] = useState(''),
    [list, setList] = useState<VideoJob[]>([]),
    [error, setError] = useState(''),
    [revision, refresh] = useState(0);
  useEffect(() => {
    let stale = false;
    const timer = setTimeout(async () => {
      const r = await videoList(q);
      if (stale) return;
      if (r.ok && r.data) {
        setList(r.data.filter((j) => j.status === 'succeeded'));
        setError('');
      } else if (!r.ok) setError(r.error);
    }, 300);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [q, revision]);
  return (
    <div className="form-stack">
      <Input
        aria-label="Найти обработанное видео"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Название видео"
      />
      <Field label="Готовое видео">
        <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">Выберите видео</option>
          {value && !list.some((j) => j.media_id === value) && (
            <option value={value}>Выбранное видео</option>
          )}
          {list.map((j) => (
            <option value={j.media_id} key={j.id}>
              {j.filename}
            </option>
          ))}
        </select>
      </Field>
      <div className="form-row">
        <Link className="button button-secondary" href="/admin/videos" target="_blank">
          Загрузить новое видео
        </Link>
        <Button type="button" variant="ghost" onClick={() => refresh((n) => n + 1)}>
          Обновить список
        </Button>
      </div>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
