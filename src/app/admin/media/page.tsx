export const metadata = { title: 'Медиатека' };
import { Download, FileText, Search } from 'lucide-react';
import { requireActor } from '@/lib/server/auth';
import { userClient } from '@/lib/server/supabase';
import { databaseError } from '@/lib/server/errors';
import { pageNumber } from '@/lib/server/data';
import { formatBytes } from '@/lib/files';
import { dateLabel } from '@/lib/utils';
import { PageHeading, Input, Button, Pagination, EmptyState } from '@/components/ui';
import { MediaUpload, MediaDelete } from '@/components/media-manager';
export default async function Media({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  await requireActor('staff');
  const params = await searchParams,
    page = pageNumber(params.page),
    db = await userClient();
  let query = db
    .from('media')
    .select('*', { count: 'exact' })
    .eq('status', 'ready')
    .eq('purpose', 'course')
    .order('created_at', { ascending: false })
    .range((page - 1) * 20, page * 20 - 1);
  if (params.q) query = query.ilike('filename', `%${params.q.slice(0, 200)}%`);
  const result = await query;
  databaseError(result.error);
  return (
    <>
      <PageHeading
        eyebrow="УЧЕБНЫЕ МАТЕРИАЛЫ"
        title="Медиатека"
        description="Приватные файлы для программ. Доступ ученикам определяется опубликованными уроками."
      />
      <div className="media-upload-panel">
        <MediaUpload />
      </div>
      <form className="filters" action="/admin/media">
        <div className="search-input">
          <Search size={17} />
          <Input
            name="q"
            aria-label="Поиск файлов"
            defaultValue={params.q}
            placeholder="Название файла"
          />
        </div>
        <Button variant="secondary">Найти</Button>
      </form>
      {result.data?.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ФАЙЛ</th>
                <th>ТИП</th>
                <th>РАЗМЕР</th>
                <th>ДОБАВЛЕН</th>
                <th>
                  <span className="sr-only">Действия</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {result.data.map((m) => (
                <tr key={m.id}>
                  <td>
                    <div className="table-title">
                      {m.mime_type.startsWith('image/') ? (
                        <img className="table-thumb" src={`/api/media/${m.id}?size=small`} alt="" />
                      ) : (
                        <span className="file-icon">
                          <FileText size={21} />
                        </span>
                      )}
                      <strong>{m.filename}</strong>
                    </div>
                  </td>
                  <td>{m.filename.split('.').at(-1)?.toUpperCase()}</td>
                  <td>{formatBytes(m.size_bytes)}</td>
                  <td>{dateLabel(m.created_at)}</td>
                  <td>
                    <div className="table-actions">
                      <a
                        className="icon-button"
                        href={`/api/media/${m.id}?download=1`}
                        aria-label={`Скачать ${m.filename}`}
                      >
                        <Download size={17} />
                      </a>
                      <MediaDelete id={m.id} filename={m.filename} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title="Загрузите первый материал"
          description="Файлы из медиатеки можно повторно использовать в уроках."
        />
      )}
      <Pagination
        total={result.count ?? 0}
        page={page}
        pageSize={20}
        path="/admin/media"
        query={params}
      />
    </>
  );
}
