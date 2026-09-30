import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { requireActor } from '@/lib/server/auth';
import { operations } from '@/lib/server/operations';
import type { StudentCard } from '@/lib/operations';
import { dateLabel } from '@/lib/utils';
import { PageHeading, Badge, ProgressBar, EmptyState, Pagination } from '@/components/ui';
import { pageNumber } from '@/lib/server/data';
export const metadata = { title: 'Карточка ученика' };
export default async function Student({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  await requireActor('admin');
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const page = pageNumber((await searchParams).page);
  const card = await operations<StudentCard>('student', { id, page });
  const p = card.profile;
  const actions: Record<string, string> = {
    'access.grant': 'Доступ выдан',
    'access.revoke': 'Доступ отозван',
    'user.role': 'Изменена роль',
    'user.disable': 'Пользователь отключён',
    'user.enable': 'Пользователь включён',
    'telegram.connect': 'Telegram подключён',
  };
  return (
    <>
      <Link href="/admin/users" className="button button-ghost">
        ← Все пользователи
      </Link>
      <PageHeading title={`${p.first_name} ${p.last_name}`} description={p.email} />
      <section className="ops-panel ops-body student-facts">
        <div>
          <Badge tone={p.disabled_at ? 'danger' : 'blue'}>
            {p.disabled_at ? 'Отключён' : 'Активен'}
          </Badge>{' '}
          <Badge>{p.role}</Badge>
        </div>
        <p>Зарегистрирован: {dateLabel(p.created_at)}</p>
        <p>Последний вход: {p.last_sign_in_at ? dateLabel(p.last_sign_in_at) : 'Ещё не входил'}</p>
      </section>
      <h2>Курсы и прогресс</h2>
      {card.courses.length ? (
        <div className="student-course-grid">
          {card.courses.map((c) => (
            <section className="ops-panel ops-body" key={c.id}>
              <div className="form-row">
                <h3>
                  <Link href={`/admin/courses/${c.id}`}>{c.title}</Link>
                </h3>
                <Badge tone={c.access ? 'blue' : 'neutral'}>
                  {c.access ? 'Доступен' : 'Доступ отозван'}
                </Badge>
              </div>
              <p>
                {c.completed} из {c.lessons} уроков завершено
              </p>
              <ProgressBar value={c.lessons ? Math.round((c.completed * 100) / c.lessons) : 0} />
              <p>Последний урок: {c.last_lesson?.title ?? 'Ещё не открывал'}</p>
              <p className="muted">
                Последняя активность:{' '}
                {c.last_activity ? dateLabel(c.last_activity) : 'Нет активности'}
              </p>
              {c.access_mode === 'registered' && <p>Курс доступен всем зарегистрированным.</p>}
              <ul>
                {c.grants.map((g, i) => (
                  <li key={i}>
                    {g.source === 'manual' ? 'Ручное назначение' : g.source} ·{' '}
                    {dateLabel(g.created_at)} ·{' '}
                    {g.revoked_at
                      ? `Отозван ${dateLabel(g.revoked_at)}`
                      : g.expires_at
                        ? `До ${dateLabel(g.expires_at)}`
                        : 'Без срока'}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <EmptyState
          title="Обучение ещё не назначено"
          description="Назначьте курс в списке пользователей."
        />
      )}
      <Pagination total={card.total} page={page} pageSize={20} path={`/admin/users/${id}`} />
      <h2>История изменений</h2>
      {card.history.length ? (
        <ol className="student-history">
          {card.history.map((a) => (
            <li key={a.id}>
              <strong>{actions[a.action] ?? a.action}</strong>
              <span>{dateLabel(a.created_at)}</span>
              <small>
                {a.entity_type} · {a.entity_id}
              </small>
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted">Изменений пока нет.</p>
      )}
      <p className="muted">Показаны последние 50 событий.</p>
    </>
  );
}
