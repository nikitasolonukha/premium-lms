export const metadata = { title: 'Пользователи' };
import { CourseFilter } from '@/components/course-filter';
import { userClient } from '@/lib/server/supabase';
import { Search, CheckCircle2 } from 'lucide-react';
import { getUsers, pageNumber } from '@/lib/server/data';
import { requireActor } from '@/lib/server/auth';
import { dateLabel, initials } from '@/lib/utils';
import { PageHeading, Input, Button, Badge, Pagination, EmptyState } from '@/components/ui';
import { InviteUser, UserManagement } from '@/components/user-management';
import Link from 'next/link';
import { BulkStudents, ImportStudents } from '@/components/admin-operations';
export default async function Users({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    role?: string;
    course?: string;
    verified?: string;
    page?: string;
  }>;
}) {
  await requireActor('admin');
  const params = await searchParams;
  const [users, selectedCourse] = await Promise.all([
    getUsers({ ...params, page: pageNumber(params.page) }),
    params.course
      ? (await userClient()).rpc('course_document', { cid: params.course, draft: true })
      : Promise.resolve(null),
  ]);
  return (
    <>
      <PageHeading
        eyebrow="СООБЩЕСТВО АКАДЕМИИ"
        title="Пользователи"
        description="Управляйте ролями и доступом к программам."
        action={<InviteUser />}
      />
      <form className="filters" action="/admin/users">
        <div className="search-input">
          <Search size={17} />
          <Input
            name="q"
            aria-label="Поиск пользователей"
            placeholder="Имя или email"
            defaultValue={params.q}
          />
        </div>
        <select name="role" className="input" aria-label="Роль" defaultValue={params.role ?? ''}>
          <option value="">Все роли</option>
          <option value="student">Student</option>
          <option value="editor">Editor</option>
          <option value="admin">Admin</option>
        </select>
        <CourseFilter
          initialId={params.course}
          initialTitle={(selectedCourse?.data as { title?: string } | null)?.title ?? ''}
        />
        <select
          name="verified"
          className="input"
          aria-label="Подтверждение email"
          defaultValue={params.verified ?? ''}
        >
          <option value="">Любой email</option>
          <option value="yes">Подтверждён</option>
          <option value="no">Не подтверждён</option>
        </select>
        <Button variant="secondary">Найти</Button>
      </form>
      <ImportStudents />
      <BulkStudents students={users.items.filter((u) => u.role === 'student' && !u.disabled_at)} />
      <p className="catalog-count">Всего: {users.total}</p>
      {users.items.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ПОЛЬЗОВАТЕЛЬ</th>
                <th>РОЛЬ</th>
                <th>ПРОГРАММЫ</th>
                <th>ПОСЛЕДНИЙ ВХОД</th>
                <th>СТАТУС</th>
                <th>
                  <span className="sr-only">Действия</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {users.items.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div className="table-title">
                      <span className="avatar">{initials(u.first_name, u.last_name)}</span>
                      <div>
                        <strong>
                          <Link href={`/admin/users/${u.id}`}>
                            {u.first_name} {u.last_name}
                          </Link>
                        </strong>
                        <small>
                          {u.email}{' '}
                          {u.email_confirmed_at && (
                            <CheckCircle2
                              size={11}
                              className="inline-icon"
                              aria-label="Email подтверждён"
                            />
                          )}
                        </small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <Badge
                      tone={u.role === 'admin' ? 'blue' : u.role === 'editor' ? 'lilac' : 'neutral'}
                    >
                      {u.role === 'admin' ? 'Admin' : u.role === 'editor' ? 'Editor' : 'Student'}
                    </Badge>
                  </td>
                  <td>{u.course_count}</td>
                  <td>{u.last_sign_in_at ? dateLabel(u.last_sign_in_at) : 'Ещё не входил'}</td>
                  <td>
                    <Badge tone={u.disabled_at ? 'danger' : 'lime'}>
                      {u.disabled_at ? 'Отключён' : 'Активен'}
                    </Badge>
                  </td>
                  <td>
                    <UserManagement user={u} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title="Пользователи не найдены"
          description="Измените фильтры или пригласите нового ученика."
        />
      )}
      <Pagination {...users} path="/admin/users" query={params} />
    </>
  );
}
