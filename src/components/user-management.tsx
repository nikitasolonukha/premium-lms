'use client';
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import * as Dialog from '@radix-ui/react-dialog';
import { ChevronLeft, ChevronRight, Plus, Search, Settings2, ShieldCheck, X } from 'lucide-react';
import { toast } from 'sonner';
import type { UserRow, PageData, CourseCard } from '@/lib/server/data';
import { setAccess, setRole, disableUser } from '@/lib/actions/content';
import { assignmentOptions, inviteUser } from '@/lib/actions/users';
import { Button, Input, Field, Badge } from './ui';
import { ConfirmDialog } from './confirm-dialog';
export function UserManagement({ user }: { user: UserRow }) {
  const [open, setOpen] = useState(false),
    [role, changeRole] = useState(user.role),
    [q, setQ] = useState(''),
    [page, setPage] = useState(1),
    [list, setList] = useState<PageData<CourseCard & { assigned: boolean }> | null>(null),
    [error, setError] = useState(''),
    [pending, start] = useTransition(),
    [revision, setRevision] = useState(0);
  const router = useRouter();
  useEffect(() => {
    if (!open) return;
    let stale = false;
    const timer = setTimeout(() => {
      start(async () => {
        const r = await assignmentOptions({ userId: user.id, q, page });
        if (stale) return;
        if (r.ok && r.data) {
          setList(r.data);
          setError('');
        } else if (!r.ok) setError(r.error);
      });
    }, 250);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [open, user.id, q, page, revision]);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button className="icon-button" aria-label={`Управлять пользователем ${user.email}`}>
          <Settings2 size={17} />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content user-dialog">
          <Dialog.Title className="dialog-title">
            {user.first_name} {user.last_name}
          </Dialog.Title>
          <Dialog.Description className="dialog-description">{user.email}</Dialog.Description>
          <Dialog.Close className="icon-button dialog-close" aria-label="Закрыть пользователя">
            <X size={18} />
          </Dialog.Close>
          <div className="form-stack">
            <div className="role-editor">
              <Field label="Роль пользователя">
                <select className="input" value={role} onChange={(e) => changeRole(e.target.value)}>
                  <option value="student">Student — обучение</option>
                  <option value="editor">Editor — черновики</option>
                  <option value="admin">Admin — управление</option>
                </select>
              </Field>
              <ConfirmDialog
                title="Изменить роль?"
                description="Административные сессии пользователя будут отозваны. Для прав Editor и Admin требуется MFA."
                trigger={
                  <Button variant="secondary" disabled={role === user.role}>
                    Изменить
                  </Button>
                }
                onConfirm={async () => {
                  const r = await setRole({ target_user: user.id, new_role: role });
                  if (!r.ok) {
                    toast.error(r.error);
                    return false;
                  }
                  toast.success('Роль изменена');
                  router.refresh();
                }}
              />
            </div>
            <div className="security-note">
              <ShieldCheck size={18} />
              <p>
                Доступы назначаются независимо от роли. Отзыв доступа сохраняет историю обучения.
              </p>
            </div>
            <h3 className="small-heading">Назначения программ</h3>
            <div className="search-input">
              <Search size={16} />
              <Input
                aria-label="Найти курс для назначения"
                placeholder="Найти программу"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            {error && (
              <div className="form-error" role="alert">
                {error}
              </div>
            )}
            <div className="assignment-list">
              {list?.items.map((c) => (
                <div className="assignment-row" key={c.id}>
                  <div>
                    <strong>{c.title}</strong>
                    <small>
                      {c.access_mode === 'registered'
                        ? 'Доступен всем зарегистрированным'
                        : c.published
                          ? 'Опубликован'
                          : 'Черновик'}
                    </small>
                  </div>
                  <Button
                    variant={c.assigned ? 'secondary' : 'primary'}
                    busy={pending}
                    onClick={() =>
                      start(async () => {
                        const r = await setAccess({
                          target_user: user.id,
                          cid: c.id,
                          enabled: !c.assigned,
                        });
                        if (!r.ok) toast.error(r.error);
                        else {
                          toast.success(r.data?.message);
                          setRevision((v) => v + 1);
                          router.refresh();
                        }
                      })
                    }
                  >
                    {c.assigned ? 'Отозвать' : 'Назначить'}
                  </Button>
                </div>
              ))}
              {list && !list.items.length && <p className="muted text-small">Курсы не найдены.</p>}
            </div>
            {list && list.total > list.pageSize && (
              <div className="assignment-pagination">
                <Button
                  variant="ghost"
                  aria-label="Предыдущие назначения"
                  disabled={page === 1 || pending}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft size={16} />
                </Button>
                <span>
                  {page} / {Math.ceil(list.total / list.pageSize)}
                </span>
                <Button
                  variant="ghost"
                  aria-label="Следующие назначения"
                  disabled={page * list.pageSize >= list.total || pending}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight size={16} />
                </Button>
              </div>
            )}
            <div className="user-disable">
              <Badge tone={user.disabled_at ? 'danger' : 'lime'}>
                {user.disabled_at ? 'Аккаунт отключён' : 'Аккаунт активен'}
              </Badge>
              <ConfirmDialog
                title={user.disabled_at ? 'Включить аккаунт?' : 'Отключить аккаунт?'}
                description={
                  user.disabled_at
                    ? 'Пользователь снова сможет входить в академию.'
                    : 'Все сессии будут отозваны. История обучения и данные сохранятся.'
                }
                confirmLabel={user.disabled_at ? 'Включить' : 'Отключить'}
                danger={!user.disabled_at}
                trigger={
                  <Button variant="ghost">
                    {user.disabled_at ? 'Включить' : 'Отключить аккаунт'}
                  </Button>
                }
                onConfirm={async () => {
                  const r = await disableUser({
                    target_user: user.id,
                    disabled: !user.disabled_at,
                  });
                  if (!r.ok) {
                    toast.error(r.error);
                    return false;
                  }
                  toast.success(r.data?.message);
                  setOpen(false);
                  router.refresh();
                }}
              />
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function InviteUser() {
  const [open, setOpen] = useState(false),
    [email, setEmail] = useState(''),
    [first, setFirst] = useState(''),
    [last, setLast] = useState(''),
    [pending, start] = useTransition(),
    [error, setError] = useState('');
  const router = useRouter();
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button>
          <Plus size={17} />
          Пригласить
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content">
          <Dialog.Title className="dialog-title">Пригласить ученика</Dialog.Title>
          <Dialog.Description className="dialog-description">
            Отправим письмо со ссылкой для создания пароля. После регистрации можно назначить курсы.
          </Dialog.Description>
          <Dialog.Close className="icon-button dialog-close" aria-label="Закрыть приглашение">
            <X size={18} />
          </Dialog.Close>
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const r = await inviteUser({ email, first_name: first, last_name: last });
                if (!r.ok) setError(r.error);
                else {
                  toast.success(r.data?.message);
                  setOpen(false);
                  router.refresh();
                }
              });
            }}
          >
            <Field label="Email">
              <Input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <div className="form-row">
              <Field label="Имя">
                <Input required value={first} onChange={(e) => setFirst(e.target.value)} />
              </Field>
              <Field label="Фамилия">
                <Input value={last} onChange={(e) => setLast(e.target.value)} />
              </Field>
            </div>
            {error && (
              <div role="alert" className="form-error">
                {error}
              </div>
            )}
            <Button busy={pending} type="submit">
              Отправить приглашение
            </Button>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
