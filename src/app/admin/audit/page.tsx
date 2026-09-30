export const metadata = { title: 'Журнал действий' };
import { requireActor } from '@/lib/server/auth';
import { userClient } from '@/lib/server/supabase';
import { databaseError } from '@/lib/server/errors';
import { pageNumber } from '@/lib/server/data';
import { PageHeading, Badge, Pagination, EmptyState, Button } from '@/components/ui';
const labels: Record<string, string> = {
  'admin.login': 'Вход в управление',
  'course.create': 'Создание курса',
  'course.publish': 'Публикация курса',
  'course.delete': 'Архивирование курса',
  'lesson.delete': 'Удаление урока',
  'access.grant': 'Выдача доступа',
  'access.revoke': 'Отзыв доступа',
  'user.role': 'Изменение роли',
  'user.disable': 'Состояние аккаунта',
  'settings.update': 'Настройки академии',
  'category.save': 'Сохранение категории',
  'category.delete': 'Удаление категории',
  'media.delete': 'Удаление файла',
};
export default async function Audit({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; page?: string }>;
}) {
  await requireActor('admin');
  const params = await searchParams,
    page = pageNumber(params.page),
    db = await userClient();
  let query = db
    .from('audit_logs')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((page - 1) * 30, page * 30 - 1);
  if (params.action) query = query.eq('action', params.action);
  const result = await query;
  databaseError(result.error);
  const ids = [...new Set(result.data?.map((r) => r.actor_id).filter(Boolean) as string[])];
  const profiles = ids.length
    ? await db.from('profiles').select('id,first_name,last_name').in('id', ids)
    : null;
  return (
    <>
      <PageHeading
        eyebrow="ПРОЗРАЧНОЕ УПРАВЛЕНИЕ"
        title="Журнал действий"
        description="История значимых изменений. Записи добавляются системой и недоступны для редактирования."
      />
      <form className="filters" action="/admin/audit">
        <select
          className="input"
          name="action"
          aria-label="Тип действия"
          defaultValue={params.action ?? ''}
        >
          <option value="">Все действия</option>
          {Object.entries(labels).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <Button variant="secondary">Применить</Button>
      </form>
      {result.data?.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ВРЕМЯ</th>
                <th>ДЕЙСТВИЕ</th>
                <th>КТО</th>
                <th>ОБЪЕКТ</th>
                <th>ДЕТАЛИ</th>
              </tr>
            </thead>
            <tbody>
              {result.data.map((row) => {
                const actor = profiles?.data?.find((p) => p.id === row.actor_id);
                return (
                  <tr key={row.id}>
                    <td className="nowrap">
                      {new Intl.DateTimeFormat('ru', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                        timeZone: 'Europe/Moscow',
                      }).format(new Date(row.created_at))}
                    </td>
                    <td>
                      <Badge
                        tone={
                          row.action.includes('delete') || row.action.includes('revoke')
                            ? 'peach'
                            : 'neutral'
                        }
                      >
                        {labels[row.action] ?? row.action}
                      </Badge>
                    </td>
                    <td>{actor ? `${actor.first_name} ${actor.last_name}` : 'Оператор'}</td>
                    <td>
                      <span className="audit-id" title={row.entity_id ?? ''}>
                        {row.entity_type} · {row.entity_id?.slice(0, 8)}
                      </span>
                    </td>
                    <td>
                      <details className="audit-details">
                        <summary>Показать</summary>
                        <pre>{JSON.stringify(row.metadata, null, 2)}</pre>
                      </details>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title="Записей пока нет"
          description="Действия администраторов появятся здесь автоматически."
        />
      )}
      <Pagination
        total={result.count ?? 0}
        page={page}
        pageSize={30}
        path="/admin/audit"
        query={params}
      />
    </>
  );
}
