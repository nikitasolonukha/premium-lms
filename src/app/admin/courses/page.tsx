export const metadata = { title: 'Управление курсами' };
import Link from 'next/link';
import { Plus, Search } from 'lucide-react';
import { getCatalog, getCategories, pageNumber } from '@/lib/server/data';
import { requireActor } from '@/lib/server/auth';
import { dateLabel } from '@/lib/utils';
import { PageHeading, Badge, EmptyState, Input, Button, Pagination } from '@/components/ui';
import { AdminCourseActions } from '@/components/admin-course-actions';
export default async function AdminCourses({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    category?: string;
    page?: string;
    status?: string;
    sort?: string;
  }>;
}) {
  const params = await searchParams;
  const [actor, catalog, categories] = await Promise.all([
    requireActor('staff'),
    getCatalog({
      ...params,
      sort: params.sort ?? 'newest',
      page: pageNumber(params.page),
      staff: true,
    }),
    getCategories(),
  ]);
  return (
    <>
      <PageHeading
        eyebrow="КОНТЕНТ"
        title="Курсы"
        description="Создавайте программы и управляйте учебными материалами."
        action={
          <Link className="button button-primary" href="/admin/courses/new">
            <Plus size={17} />
            Создать курс
          </Link>
        }
      />
      <form className="filters" action="/admin/courses">
        <div className="search-input">
          <Search size={17} />
          <Input
            name="q"
            aria-label="Поиск курсов"
            placeholder="Найти курс"
            defaultValue={params.q}
          />
        </div>
        <select
          className="input"
          name="category"
          aria-label="Категория"
          defaultValue={params.category ?? ''}
        >
          <option value="">Все категории</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          className="input"
          name="status"
          aria-label="Статус курса"
          defaultValue={params.status ?? ''}
        >
          <option value="">Все статусы</option>
          <option value="draft">Черновики</option>
          <option value="published">Опубликованные</option>
          <option value="changed">Есть изменения</option>
        </select>
        <select
          className="input"
          name="sort"
          aria-label="Сортировка"
          defaultValue={params.sort ?? 'newest'}
        >
          <option value="newest">По обновлению</option>
          <option value="title">По названию</option>
        </select>
        <Button variant="secondary">Найти</Button>
        {(params.q || params.category || params.status) && (
          <Link className="text-link" href="/admin/courses">
            Сбросить фильтры
          </Link>
        )}
      </form>
      {catalog.items.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>КУРС</th>
                <th>СТАТУС</th>
                <th>УРОКИ</th>
                <th>ОБНОВЛЁН</th>
                <th>
                  <span className="sr-only">Действия</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {catalog.items.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link className="table-title" href={`/admin/courses/${c.id}`}>
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
                    {c.published && c.has_draft && (
                      <div className="table-substatus">Есть изменения</div>
                    )}
                  </td>
                  <td>{c.lesson_count}</td>
                  <td>{dateLabel(c.updated_at)}</td>
                  <td>
                    <AdminCourseActions id={c.id} title={c.title} admin={actor.role === 'admin'} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title="Пока нет курсов"
          description="Создайте курс или измените параметры поиска."
        />
      )}
      <Pagination {...catalog} path="/admin/courses" query={params} />
    </>
  );
}
