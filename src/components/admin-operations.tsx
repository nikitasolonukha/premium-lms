'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button, Field, Input, Badge } from './ui';
import { ConfirmDialog } from './confirm-dialog';
import { courseFilterOptions } from '@/lib/actions/users';
import {
  bulkAccess,
  previewImport,
  confirmImport,
  operationCommand,
  telegramLink,
  saveRule,
} from '@/lib/actions/operations';
import {
  statusLabels,
  operationErrors,
  type PreviewRow,
  type OperationJob,
  type Connection,
  type AutomationRule,
} from '@/lib/operations';
import { dateLabel } from '@/lib/utils';
import type { ActionResult } from '@/lib/server/errors';

function notify(result: ActionResult<unknown>, message: string) {
  if (!result.ok) {
    toast.error(result.error);
    return false;
  }
  toast.success(message);
  return true;
}
export function CourseChoice({
  value,
  onChange,
  optional = false,
}: {
  value: string;
  onChange: (id: string) => void;
  optional?: boolean;
}) {
  const [q, setQ] = useState(''),
    [page, setPage] = useState(1),
    [items, setItems] = useState<{ id: string; title: string }[]>([]),
    [total, setTotal] = useState(0),
    [busy, start] = useTransition(),
    [error, setError] = useState('');
  useEffect(() => {
    let stale = false;
    const t = setTimeout(
      () =>
        start(async () => {
          const r = await courseFilterOptions({ q, page });
          if (stale) return;
          if (r.ok && r.data) {
            setItems(r.data.items);
            setTotal(r.data.total);
            setError('');
          } else if (!r.ok) setError(r.error);
        }),
      250,
    );
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [q, page]);
  return (
    <fieldset className="course-choice">
      <legend>{optional ? 'Курс при импорте (необязательно)' : 'Курс для группы'}</legend>
      <Input
        aria-label="Поиск курса для группы"
        placeholder="Найти курс"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setPage(1);
        }}
      />
      <select
        className="input"
        aria-label="Выбрать курс для группы"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{optional ? 'Без назначения курса' : 'Выберите курс'}</option>
        {value && !items.some((c) => c.id === value) && (
          <option value={value}>Выбранный курс</option>
        )}
        {items.map((c) => (
          <option key={c.id} value={c.id}>
            {c.title}
          </option>
        ))}
      </select>
      {error && <p role="alert">{error}</p>}
      <div className="form-row">
        <Button
          type="button"
          variant="ghost"
          disabled={page === 1 || busy}
          onClick={() => setPage((p) => p - 1)}
        >
          Назад
        </Button>
        <span>
          {page} / {Math.max(1, Math.ceil(total / 12))}
        </span>
        <Button
          type="button"
          variant="ghost"
          disabled={page * 12 >= total || busy}
          onClick={() => setPage((p) => p + 1)}
        >
          Далее
        </Button>
      </div>
    </fieldset>
  );
}
export function BulkStudents({
  students,
}: {
  students: { id: string; first_name: string; last_name: string; email: string }[];
}) {
  const [ids, setIds] = useState<string[]>([]),
    [course, setCourse] = useState('');
  const router = useRouter();
  const request = useRef(crypto.randomUUID());
  async function run(enabled: boolean) {
    const r = await bulkAccess({
      requestId: request.current,
      courseId: course,
      userIds: ids,
      enabled,
    });
    if (!notify(r, `Доступ ${enabled ? 'назначен' : 'отозван'} для ${ids.length} учеников`))
      return false;
    request.current = crypto.randomUUID();
    setIds([]);
    router.refresh();
  }
  function change(next: string[]) {
    setIds(next);
    request.current = crypto.randomUUID();
  }
  return (
    <details className="ops-panel">
      <summary>Массовые действия · ученики на этой странице</summary>
      <div className="ops-body">
        <div className="form-row">
          <Button
            variant="secondary"
            onClick={() => change(students.map((s) => s.id))}
            disabled={!students.length}
          >
            Выбрать всех
          </Button>
          <Button variant="ghost" onClick={() => change([])}>
            Снять выбор
          </Button>
          <span role="status">Выбрано: {ids.length}</span>
        </div>
        <div className="bulk-students">
          {students.map((s) => (
            <label key={s.id}>
              <input
                type="checkbox"
                checked={ids.includes(s.id)}
                onChange={(e) =>
                  change(e.target.checked ? [...ids, s.id] : ids.filter((id) => id !== s.id))
                }
              />
              <span>
                <strong>
                  {s.first_name} {s.last_name}
                </strong>
                <small>{s.email}</small>
              </span>
            </label>
          ))}
        </div>
        <CourseChoice
          value={course}
          onChange={(id) => {
            setCourse(id);
            request.current = crypto.randomUUID();
          }}
        />
        <div className="form-row">
          <ConfirmDialog
            title="Назначить доступ группе?"
            description={`Курс получат ${ids.length} учеников. Повтор запроса не создаст дубликаты.`}
            trigger={<Button disabled={!ids.length || !course}>Назначить курс</Button>}
            onConfirm={() => run(true)}
          />
          <ConfirmDialog
            title="Отозвать доступ группы?"
            description="Будет отозван ручной доступ. История и прогресс сохранятся. Курсы для всех зарегистрированных останутся доступны."
            trigger={
              <Button variant="danger" disabled={!ids.length || !course}>
                Отозвать доступ
              </Button>
            }
            onConfirm={() => run(false)}
          />
        </div>
      </div>
    </details>
  );
}
export function ImportStudents() {
  const [preview, setPreview] = useState<{ id: string; rows: PreviewRow[] } | null>(null),
    [course, setCourse] = useState(''),
    [busy, start] = useTransition(),
    [error, setError] = useState(''),
    [job, setJob] = useState('');
  const router = useRouter();
  const issues = preview?.rows.filter((r) => r.issues.length).length ?? 0;
  return (
    <details className="ops-panel">
      <summary>Импорт учеников из CSV / XLSX</summary>
      <div className="ops-body">
        <p>
          До 500 учеников на одном листе. Новые ученики получат приглашение по email; существующим
          назначится выбранный курс.
        </p>
        <a
          className="button button-secondary"
          download="students.csv"
          href={
            'data:text/csv;charset=utf-8,' +
            encodeURIComponent(
              '\uFEFFemail;first_name;last_name\r\nstudent@example.com;Анна;Иванова\r\n',
            )
          }
        >
          Скачать шаблон CSV
        </a>
        <form
          className="form-stack"
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            start(async () => {
              setError('');
              setPreview(null);
              setJob('');
              const r = await previewImport(form);
              if (r.ok && r.data) setPreview(r.data);
              else if (!r.ok) setError(r.error);
            });
          }}
        >
          <Field label="Таблица учеников">
            <Input
              name="file"
              type="file"
              accept=".csv,.xlsx"
              required
              onChange={() => setPreview(null)}
            />
          </Field>
          <Button busy={busy}>Проверить таблицу</Button>
        </form>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {preview && (
          <>
            <p role="status">
              Строк: {preview.rows.length} · Новых:{' '}
              {preview.rows.filter((r) => !r.existing_id).length} · Ошибок: {issues}
            </p>
            <div className="table-wrap import-preview">
              <table>
                <thead>
                  <tr>
                    <th>Строка</th>
                    <th>Ученик</th>
                    <th>Результат проверки</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r) => (
                    <tr key={r.number}>
                      <td>{r.number}</td>
                      <td>
                        {r.first_name} {r.last_name}
                        <small>{r.email}</small>
                      </td>
                      <td>
                        {r.issues.length
                          ? r.issues.join(', ')
                          : r.existing_id
                            ? 'Существующий ученик'
                            : 'Будет приглашён'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <CourseChoice optional value={course} onChange={setCourse} />
            <ConfirmDialog
              title="Начать импорт?"
              description={`Будут обработаны ${preview.rows.length} строк. Новым ученикам уйдут приглашения. Статус и повтор доступны в автоматизациях.`}
              trigger={<Button disabled={issues > 0 || busy}>Подтвердить импорт</Button>}
              onConfirm={async () => {
                const r = await confirmImport({
                  id: preview.id,
                  ...(course ? { courseId: course } : {}),
                });
                if (!r.ok) {
                  setError(r.error);
                  return false;
                }
                setJob(r.data?.id ?? '');
                setPreview(null);
                router.refresh();
              }}
            />
          </>
        )}
        {job && (
          <p role="status">
            Импорт поставлен в очередь. <Link href="/admin/automations">Смотреть результат</Link>
          </p>
        )}
      </div>
    </details>
  );
}
export function Jobs({ jobs }: { jobs: OperationJob[] }) {
  const router = useRouter();
  return jobs.length ? (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Задание</th>
            <th>Статус</th>
            <th>Результат</th>
            <th>Создано</th>
            <th>Действие</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((j) => (
            <tr key={j.id}>
              <td>
                {j.title ||
                  ({ import: 'Импорт учеников', report: 'Отчёт', video: 'Видео' }[j.kind] ??
                    j.kind)}
              </td>
              <td>
                <Badge tone={j.status === 'failed' ? 'danger' : 'blue'}>
                  {statusLabels[j.status]}
                </Badge>
                {j.status === 'running' && <small>{j.progress}%</small>}
              </td>
              <td>
                {j.error_code
                  ? (operationErrors[j.error_code] ?? 'Ошибка обработки')
                  : j.kind === 'import'
                    ? `Обработано строк: ${Object.values(j.result).filter((v) => v && typeof v === 'object' && 'status' in v && v.status === 'done').length}`
                    : j.status === 'succeeded'
                      ? 'Выполнено'
                      : '—'}
              </td>
              <td>{dateLabel(j.created_at)}</td>
              <td>
                {j.status === 'failed' && (
                  <ConfirmDialog
                    title="Повторить задание?"
                    description={
                      j.error_code === 'DELIVERY_UNKNOWN'
                        ? operationErrors.DELIVERY_UNKNOWN
                        : 'Обработанные строки и подтверждённые доставки пропускаются.'
                    }
                    trigger={<Button variant="secondary">Повторить</Button>}
                    onConfirm={async () => {
                      const r = await operationCommand({ op: 'job.retry', id: j.id });
                      if (!notify(r, 'Задание возвращено в очередь')) return false;
                      router.refresh();
                    }}
                  />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <p className="muted">Заданий пока нет.</p>
  );
}
export function RefreshOperations({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, 10000);
    return () => clearInterval(t);
  }, [active, router]);
  return (
    <Button variant="secondary" onClick={() => router.refresh()}>
      Обновить статусы
    </Button>
  );
}
const kinds = {
  summary: 'Сводка за сутки',
  inactive: 'Неактивные ученики',
  completions: 'Завершения за неделю',
};
export function AutomationsManager({
  rules,
  connections,
  configured,
  botUsername,
}: {
  rules: AutomationRule[];
  connections: Connection[];
  configured: boolean;
  botUsername?: string;
}) {
  const router = useRouter(),
    [busy, start] = useTransition(),
    [link, setLink] = useState(''),
    [error, setError] = useState(''),
    [editing, setEditing] = useState<AutomationRule | null>(null),
    [recipients, setRecipients] = useState<string[]>([]);
  const own = connections.filter((c) => c.enabled);
  return (
    <div className="form-stack">
      <section className="ops-panel ops-body">
        <h2>Telegram владельца</h2>
        <p>
          Подключение подтверждается из вашей сессии с MFA. Бот отдаёт отчёты только связанным
          администраторам в личном чате.
        </p>
        {!configured && <p className="form-error">Токен бота ещё не настроен на сервере.</p>}
        <div className="form-row">
          <Button
            busy={busy}
            disabled={!configured || !botUsername}
            onClick={() =>
              start(async () => {
                const r = await telegramLink();
                if (r.ok && r.data)
                  setLink(`https://t.me/${botUsername}?start=lms_${r.data.token}`);
                else if (!r.ok) setError(r.error);
              })
            }
          >
            Подключить мой Telegram
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              start(async () => {
                if (
                  notify(await operationCommand({ op: 'telegram.disconnect' }), 'Telegram отключён')
                ) {
                  setLink('');
                  router.refresh();
                }
              })
            }
          >
            Отключить мой Telegram
          </Button>
        </div>
        {configured && !botUsername && (
          <p role="status">Запустите обработчик: он проверит бота и получит имя для подключения.</p>
        )}
        {link && (
          <p>
            <a href={link} target="_blank" rel="noreferrer">
              Открыть бота и подтвердить подключение
            </a>{' '}
            · ссылка действует 5 минут
          </p>
        )}
        <ul>
          {connections.map((c) => (
            <li key={c.id}>
              {c.name} — {c.enabled ? 'подключён' : 'отключён'}
            </li>
          ))}
        </ul>
      </section>
      <section className="ops-panel ops-body">
        <h2>{editing ? 'Изменить правило' : 'Новое правило'}</h2>
        <form
          key={editing?.id ?? 'new'}
          className="form-stack"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            start(async () => {
              const r = await saveRule({
                ...(editing ? { id: editing.id } : {}),
                name: f.get('name'),
                kind: f.get('kind'),
                enabled: f.get('enabled') === 'on',
                frequency: f.get('frequency'),
                hour: Number(String(f.get('time')).split(':')[0]),
                minute: Number(String(f.get('time')).split(':')[1]),
                weekday: Number(f.get('weekday')),
                timezone: f.get('timezone'),
                recipients,
              });
              if (notify(r, 'Правило сохранено')) {
                setEditing(null);
                router.refresh();
              }
            });
          }}
        >
          <div className="form-row">
            <Field label="Название правила">
              <Input name="name" maxLength={100} required defaultValue={editing?.name} />
            </Field>
            <Field label="Отчёт">
              <select name="kind" className="input" defaultValue={editing?.kind ?? 'summary'}>
                {Object.entries(kinds).map(([v, t]) => (
                  <option key={v} value={v}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="ops-schedule">
            <Field label="Расписание">
              <select
                name="frequency"
                className="input"
                defaultValue={editing?.frequency ?? 'daily'}
              >
                <option value="daily">Каждый день</option>
                <option value="weekly">Раз в неделю</option>
              </select>
            </Field>
            <Field label="Время">
              <Input
                name="time"
                type="time"
                required
                defaultValue={
                  editing
                    ? `${String(editing.hour).padStart(2, '0')}:${String(editing.minute).padStart(2, '0')}`
                    : '09:00'
                }
              />
            </Field>
            <Field label="День для недельного правила">
              <select name="weekday" className="input" defaultValue={editing?.weekday ?? 1}>
                {['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'].map((d, i) => (
                  <option key={d} value={i}>
                    {d}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Часовой пояс">
              <Input
                name="timezone"
                required
                defaultValue={editing?.timezone ?? 'Europe/Moscow'}
                maxLength={100}
              />
            </Field>
          </div>
          <fieldset>
            <legend>Получатели</legend>
            {own.length ? (
              own.map((c) => (
                <label className="ops-check" key={c.id}>
                  <input
                    type="checkbox"
                    checked={recipients.includes(c.id)}
                    onChange={(e) =>
                      setRecipients(
                        e.target.checked
                          ? [...recipients, c.id]
                          : recipients.filter((id) => id !== c.id),
                      )
                    }
                  />
                  {c.name}
                </label>
              ))
            ) : (
              <p>Сначала подключите Telegram администратора.</p>
            )}
          </fieldset>
          <label className="ops-check">
            <input name="enabled" type="checkbox" defaultChecked={editing?.enabled ?? false} />
            Включить по расписанию
          </label>
          <div className="form-row">
            <Button busy={busy} disabled={!recipients.length}>
              Сохранить правило
            </Button>
            {editing && (
              <Button
                variant="ghost"
                type="button"
                onClick={() => {
                  setEditing(null);
                  setRecipients([]);
                }}
              >
                Отменить
              </Button>
            )}
          </div>
        </form>
        {error && <p role="alert">{error}</p>}
      </section>
      <section>
        <h2>Правила</h2>
        {rules.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Название</th>
                  <th>Расписание</th>
                  <th>Статус</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.name}</strong>
                      <small>{kinds[r.kind]}</small>
                    </td>
                    <td>
                      {r.frequency === 'daily' ? 'Ежедневно' : 'Еженедельно'}{' '}
                      {String(r.hour).padStart(2, '0')}:{String(r.minute).padStart(2, '0')}
                      <small>
                        {r.timezone} ·{' '}
                        {r.enabled ? `Следующий: ${dateLabel(r.next_run_at)}` : 'Приостановлено'}
                      </small>
                    </td>
                    <td>
                      <Badge>{r.enabled ? 'Включено' : 'Пауза'}</Badge>
                    </td>
                    <td>
                      <div className="ops-actions">
                        <Button
                          variant="ghost"
                          onClick={() => {
                            setEditing(r);
                            setRecipients(r.recipients);
                          }}
                        >
                          Изменить
                        </Button>
                        <Button
                          busy={busy}
                          variant="secondary"
                          onClick={() =>
                            start(async () => {
                              if (
                                notify(
                                  await operationCommand({
                                    op: 'rule.toggle',
                                    id: r.id,
                                    enabled: !r.enabled,
                                  }),
                                  'Статус изменён',
                                )
                              )
                                router.refresh();
                            })
                          }
                        >
                          {r.enabled ? 'Выключить' : 'Включить'}
                        </Button>
                        <Button
                          busy={busy}
                          variant="secondary"
                          onClick={() =>
                            start(async () => {
                              if (
                                notify(
                                  await operationCommand({ op: 'rule.run', id: r.id }),
                                  'Отчёт поставлен в очередь',
                                )
                              )
                                router.refresh();
                            })
                          }
                        >
                          Запустить сейчас
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">Правил пока нет.</p>
        )}
      </section>
    </div>
  );
}
