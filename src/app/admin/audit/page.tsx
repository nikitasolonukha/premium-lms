export const metadata = { title: 'Журнал действий' };
import { requireActor } from '@/lib/server/auth';
import { userClient } from '@/lib/server/supabase';
import { databaseError, rpcResult } from '@/lib/server/errors';
import { z } from 'zod';
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
  'operator.bootstrap': 'Первый администратор',
  'operator.mfa_recovery': 'Восстановление MFA',
  'video.provider_config': 'Конфигурация видео',
};
const dateFilter = z.union([z.literal(''), z.iso.date()]);
const filters = z
  .object({
    action: z.string().max(100).default(''),
    actor: z.string().max(254).default(''),
    entity: z.string().max(200).default(''),
    from: dateFilter.default(''),
    to: dateFilter.default(''),
  })
  .refine((p) => !p.from || !p.to || p.from <= p.to);
type AuditPage = {
  items: {
    id: number;
    action: string;
    actor_id: string | null;
    first_name: string | null;
    last_name: string | null;
    entity_type: string;
    entity_id: string | null;
    metadata: unknown;
    created_at: string;
  }[];
  total: number;
  page: number;
  pageSize: number;
};
export default async function Audit({
  searchParams,
}: {
  searchParams: Promise<{
    action?: string;
    actor?: string;
    entity?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
}) {
  await requireActor('admin');
  const params = await searchParams,
    page = pageNumber(params.page),
    db = await userClient();
  const parsed = filters.safeParse(params);
  if (!parsed.success)
    return (
      <EmptyState
        title="Проверьте фильтры"
        description="Укажите корректные даты и сократите поисковый запрос."
      />
    );
  const f = parsed.data;
  const result = await db.rpc('audit_index', {
    q_action: f.action,
    q_actor: f.actor,
    q_entity: f.entity,
    date_from: f.from,
    date_to: f.to,
    page,
  });
  databaseError(result.error);
  const data = rpcResult<AuditPage>(result.data);
  return (
    <>
      <PageHeading
        eyebrow="ПРОЗРАЧНОЕ УПРАВЛЕНИЕ"
        title="Журнал действий"
        description="История значимых изменений. Записи добавляются системой и недоступны для редактирования."
      />
      <form className="filters audit-filters" action="/admin/audit">
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
        <input
          className="input"
          name="actor"
          aria-label="Автор: имя, email или ID"
          placeholder="Автор: имя, email или ID"
          maxLength={254}
          defaultValue={f.actor}
        />
        <input
          className="input"
          name="entity"
          aria-label="Объект: тип или ID"
          placeholder="Объект: тип или ID"
          maxLength={200}
          defaultValue={f.entity}
        />
        <label className="field">
          С даты (МСК)
          <input className="input" name="from" type="date" defaultValue={f.from} />
        </label>
        <label className="field">
          По дату (МСК)
          <input className="input" name="to" type="date" defaultValue={f.to} />
        </label>
        <Button variant="secondary">Применить</Button>
      </form>
      {data.items.length ? (
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Журнал действий">
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
              {data.items.map((row) => {
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
                    <td>
                      {row.actor_id
                        ? `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim() ||
                          row.actor_id.slice(0, 8)
                        : 'Оператор'}
                    </td>
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
        total={data.total}
        page={data.page}
        pageSize={data.pageSize}
        path="/admin/audit"
        query={params}
      />
    </>
  );
}
