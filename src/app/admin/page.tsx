export const metadata = { title: 'Обзор академии' };
import Link from 'next/link';
import { ArrowUpRight, BookOpen, CheckCircle2, Plus, TrendingUp, Users } from 'lucide-react';
import { getAnalytics, getCatalog } from '@/lib/server/data';
import { requireActor } from '@/lib/server/auth';
import { dateLabel } from '@/lib/utils';
import { PageHeading, EmptyState, Badge } from '@/components/ui';
export default async function AdminHome() {
  const actor = await requireActor('staff'),
    catalog = await getCatalog({ staff: true });
  const analytics = actor.role === 'admin' ? await getAnalytics() : null;
  const totalEnrollments = analytics?.totals.enrollments ?? 0,
    completions = analytics?.totals.completions ?? 0,
    max = Math.max(1, ...(analytics?.activity.map((d) => d.active) ?? []));
  return (
    <>
      <PageHeading
        eyebrow="АКАДЕМИЯ / УПРАВЛЕНИЕ"
        title="Всё важное — в одном месте"
        description={
          actor.role === 'admin'
            ? 'Следите за обучением и создавайте пространство для роста.'
            : 'Готовьте материалы и передавайте готовые программы на публикацию.'
        }
        action={
          <Link className="button button-primary" href="/admin/courses/new">
            <Plus size={17} />
            Создать курс
          </Link>
        }
      />
      {analytics && (
        <>
          <div className="stat-grid">
            {[
              {
                label: 'Всего учеников и команды',
                value: analytics.users,
                icon: Users,
                note: 'Активные аккаунты',
              },
              {
                label: 'Активны за 30 дней',
                value: analytics.active30,
                icon: TrendingUp,
                note: 'Открывали учебные материалы',
              },
              {
                label: 'Назначения программ',
                value: totalEnrollments,
                icon: BookOpen,
                note: 'Действующие индивидуальные доступы',
              },
              {
                label: 'Завершения программ',
                value: completions,
                icon: CheckCircle2,
                note: 'По текущему составу уроков',
              },
            ].map((s) => (
              <div className="stat-card" key={s.label}>
                <div className="stat-label">
                  {s.label}
                  <s.icon size={17} />
                </div>
                <div className="stat-value">{s.value}</div>
                <div className="stat-note">{s.note}</div>
              </div>
            ))}
          </div>
          <div className="admin-two-col">
            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2>Ритм обучения</h2>
                  <p>Активные ученики · последние 30 дней</p>
                </div>
                <Badge tone="lime">30 дней</Badge>
              </div>
              {analytics.active30 ? (
                <>
                  <div
                    className="chart-bars"
                    role="img"
                    aria-label={`Активность за 30 дней: ${analytics.active30} пользователей`}
                  >
                    {analytics.activity.map((d) => (
                      <div
                        key={d.day}
                        className="chart-bar"
                        style={{ height: `${Math.max(2, (d.active / max) * 100)}%` }}
                        title={`${dateLabel(d.day)}: ${d.active}`}
                      />
                    ))}
                  </div>
                  <div className="chart-labels">
                    <span>{dateLabel(analytics.activity[0].day)}</span>
                    <span>{dateLabel(analytics.activity.at(-1)!.day)}</span>
                  </div>
                </>
              ) : (
                <EmptyState
                  title="Ждём первые шаги"
                  description="График появится, когда ученики начнут открывать уроки."
                />
              )}
            </section>
            <section className="panel">
              <div className="panel-header">
                <h2>Недавняя активность</h2>
                <Link
                  className="text-link"
                  href="/admin/analytics"
                  aria-label="Открыть аналитику активности"
                >
                  <ArrowUpRight size={16} />
                </Link>
              </div>
              {analytics.recent.length ? (
                analytics.recent.slice(0, 4).map((a, i) => (
                  <div className="activity-item" key={i}>
                    <span className="dot-marker" />
                    <div>
                      <strong>
                        {a.first_name} {a.last_name}
                      </strong>
                      <p>
                        {a.completed_at ? 'Завершён урок' : 'Открыт урок'} · {a.lesson}
                      </p>
                    </div>
                    <time>{dateLabel(a.last_opened_at)}</time>
                  </div>
                ))
              ) : (
                <p className="muted text-small">Пока нет активности учеников.</p>
              )}
            </section>
          </div>
        </>
      )}
      <div className="section-heading">
        <h2>
          Ваши курсы<span className="count">{catalog.total}</span>
        </h2>
        <Link className="text-link" href="/admin/courses">
          Все курсы <ArrowUpRight size={16} />
        </Link>
      </div>
      {catalog.items.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>КУРС</th>
                <th>СТАТУС</th>
                <th>УРОКИ</th>
                <th>ОБНОВЛЁН</th>
              </tr>
            </thead>
            <tbody>
              {catalog.items.slice(0, 5).map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link href={`/admin/courses/${c.id}`} className="table-title">
                      {c.cover_id && (
                        <img
                          className="table-thumb"
                          src={`/api/media/${c.cover_id}?size=small`}
                          alt=""
                        />
                      )}
                      <div>
                        <strong>{c.title}</strong>
                        <small>{c.category_name ?? 'Без категории'}</small>
                      </div>
                    </Link>
                  </td>
                  <td>
                    <Badge tone={c.published ? 'lime' : 'neutral'}>
                      {c.published ? 'Опубликован' : 'Черновик'}
                    </Badge>
                  </td>
                  <td>{c.lesson_count}</td>
                  <td>{dateLabel(c.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title="Создайте первую программу"
          description="Добавьте структуру курса, наполните уроки и назначьте доступ ученикам."
        />
      )}
    </>
  );
}
