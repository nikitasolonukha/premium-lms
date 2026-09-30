export const metadata = { title: 'Программы' };
import Link from 'next/link';
import Form from 'next/form';
import { Search } from 'lucide-react';
import { getCatalog, getCategories, getTags, pageNumber } from '@/lib/server/data';
import { CourseCard } from '@/components/course-card';
import { PageHeading, EmptyState, Pagination, Input, Button } from '@/components/ui';
export default async function Courses({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    category?: string;
    tag?: string;
    sort?: string;
    page?: string;
  }>;
}) {
  const params = await searchParams,
    page = pageNumber(params.page);
  const [catalog, categories, tags, featured] = await Promise.all([
    getCatalog({ ...params, page }),
    getCategories(),
    getTags(),
    getCatalog({ sort: 'featured' }),
  ]);
  return (
    <>
      <PageHeading
        title="Программы"
        description="Все курсы, к которым у вас есть доступ. Выберите тему или найдите нужный курс."
      />
      <Form className="filters catalog-filters" action="/courses" scroll={false}>
        <div className="search-input">
          <Search size={17} />
          <Input
            name="q"
            aria-label="Поиск программ"
            placeholder="Название курса или тема"
            defaultValue={params.q}
          />
        </div>
        <select
          className="input"
          name="category"
          aria-label="Категория"
          defaultValue={params.category ?? ''}
        >
          <option value="">Все направления</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          className="input"
          name="sort"
          aria-label="Сортировка"
          defaultValue={params.sort ?? 'recent'}
        >
          <option value="recent">Сначала актуальные</option>
          <option value="newest">По обновлению</option>
          <option value="title">По названию</option>
          <option value="progress">По прогрессу</option>
        </select>
        <input type="hidden" name="tag" value={params.tag ?? ''} />
        <Button type="submit" variant="secondary">
          Найти
        </Button>
      </Form>
      <div className="filter-tabs">
        <Link
          className={`filter-tab ${!params.tag ? 'active' : ''}`}
          href={`/courses?${new URLSearchParams({ ...params, page: '1', tag: '' })}`}
          scroll={false}
          aria-current={!params.tag ? 'true' : undefined}
        >
          Все темы
        </Link>
        {tags
          .map((t) => t.name)
          .slice(0, 20)
          .map((tag) => (
            <Link
              key={tag}
              className={`filter-tab ${params.tag === tag ? 'active' : ''}`}
              href={`/courses?${new URLSearchParams({ ...params, page: '1', tag })}`}
              scroll={false}
              aria-current={params.tag === tag ? 'true' : undefined}
            >
              {tag}
            </Link>
          ))}
      </div>
      <section className="catalog-results" aria-label="Результаты поиска программ">
        {page === 1 &&
          !params.q &&
          !params.category &&
          !params.tag &&
          featured.items.some((c) => c.featured) && (
            <section className="featured-section">
              <div className="featured-label">Рекомендуемые программы</div>
              <div className="course-grid">
                {featured.items
                  .filter((c) => c.featured)
                  .slice(0, 3)
                  .map((c) => (
                    <CourseCard key={c.id} course={c} />
                  ))}
              </div>
            </section>
          )}
        <p className="catalog-count" role="status">
          Доступно программ: {catalog.total}
        </p>
        {catalog.items.length ? (
          <div className="course-grid">
            {catalog.items.map((c) => (
              <CourseCard key={c.id} course={c} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="Программы не найдены"
            description="Попробуйте другую формулировку или сбросьте фильтры."
            action={
              <Link href="/courses" scroll={false} className="button button-secondary">
                Сбросить фильтры
              </Link>
            }
          />
        )}
        <Pagination {...catalog} path="/courses" query={params} />
      </section>
    </>
  );
}
