export const metadata = { title: 'Аналитика' };
import { requireActor } from '@/lib/server/auth';
import { getAnalytics } from '@/lib/server/data';
import { PageHeading, EmptyState, ProgressBar } from '@/components/ui';
import { dateLabel } from '@/lib/utils';
export default async function Analytics() {
  await requireActor('admin');
  const data = await getAnalytics(),
    max = Math.max(1, ...data.activity.map((x) => x.active));
  return (
    <>
      <PageHeading
        eyebrow="ОТ ЗНАНИЙ К РЕЗУЛЬТАТУ"
        title="Аналитика обучения"
        description="Данные обновляются из истории прохождения. Завершение курса считается по его текущему опубликованному составу."
      />
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">Пользователи</div>
          <div className="stat-value">{data.users}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Активны за 30 дней</div>
          <div className="stat-value">{data.active30}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Завершено уроков</div>
          <div className="stat-value">
            {data.courses.reduce((s, c) => s + c.completed_lessons, 0)}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Завершено программ</div>
          <div className="stat-value">{data.courses.reduce((s, c) => s + c.completions, 0)}</div>
        </div>
      </div>
      <section className="panel">
        <div className="panel-header">
          <h2>Активность за 30 дней</h2>
        </div>
        {data.active30 ? (
          <>
            <div className="chart-bars">
              {data.activity.map((d) => (
                <div
                  key={d.day}
                  className="chart-bar"
                  style={{ height: `${Math.max(2, (d.active / max) * 100)}%` }}
                  title={`${dateLabel(d.day)} · ${d.active} пользователей`}
                />
              ))}
            </div>
            <div className="chart-labels">
              <span>{dateLabel(data.activity[0].day)}</span>
              <span>{dateLabel(data.activity.at(-1)!.day)}</span>
            </div>
          </>
        ) : (
          <EmptyState
            title="Пока нет данных"
            description="Активность появится после первых посещений уроков."
          />
        )}
      </section>
      <div className="section-heading">
        <h2>По программам</h2>
      </div>
      {data.courses.length ? (
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Аналитика по программам">
          <table>
            <thead>
              <tr>
                <th>ПРОГРАММА</th>
                <th>НАЗНАЧЕНИЯ</th>
                <th>НАЧАЛИ</th>
                <th>ЗАВЕРШИЛИ</th>
                <th>СРЕДНИЙ ПРОГРЕСС НАЧАВШИХ</th>
              </tr>
            </thead>
            <tbody>
              {data.courses.map((c) => (
                <tr key={c.id}>
                  <td>
                    <strong>{c.title}</strong>
                  </td>
                  <td>{c.enrollments}</td>
                  <td>{c.started}</td>
                  <td>{c.completions}</td>
                  <td>
                    <ProgressBar
                      value={
                        c.started && c.lessons
                          ? Math.min(
                              100,
                              Math.round((c.completed_lessons / (c.started * c.lessons)) * 100),
                            )
                          : 0
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title="Нет опубликованных курсов"
          description="Опубликуйте программу и назначьте доступ ученикам."
        />
      )}
      <div className="section-heading">
        <h2>Последние действия учеников</h2>
      </div>
      <section className="panel">
        {data.recent.length ? (
          data.recent.map((a, i) => (
            <div className="activity-item" key={i}>
              <span className="dot-marker" />
              <div>
                <strong>
                  {a.first_name} {a.last_name} · {a.lesson}
                </strong>
                <p>{a.course}</p>
              </div>
              <time>{dateLabel(a.last_opened_at)}</time>
            </div>
          ))
        ) : (
          <p className="muted">Ещё никто не начал обучение.</p>
        )}
      </section>
    </>
  );
}
