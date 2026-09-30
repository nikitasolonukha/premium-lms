export const metadata = { title: 'Поиск' };
import Link from 'next/link';
import { Search } from 'lucide-react';
import { getCatalog, getLessonIndex, pageNumber } from '@/lib/server/data';
import { CourseCard } from '@/components/course-card';
import { LessonResults } from '@/components/lesson-results';
import { PageHeading, Input, Button, EmptyState, Pagination } from '@/components/ui';
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; tab?: string }>;
}) {
  const params = await searchParams,
    isLessons = params.tab === 'lessons',
    page = pageNumber(params.page);
  const [courses, lessons] = params.q
    ? await Promise.all([
        getCatalog({ q: params.q, page: isLessons ? 1 : page }),
        getLessonIndex(params.q, isLessons ? page : 1),
      ])
    : [null, null];
  const data = isLessons ? lessons : courses;
  return (
    <>
      <PageHeading
        eyebrow="НАВИГАЦИЯ ПО ЗНАНИЯМ"
        title="Найдите свой ответ"
        description="Поиск по доступным программам, описаниям и названиям уроков."
      />
      <form className="filters" action="/search">
        <div className="search-input">
          <Search size={18} />
          <Input
            name="q"
            autoFocus
            aria-label="Поиск"
            placeholder="Тема, программа или урок"
            defaultValue={params.q}
            maxLength={200}
          />
        </div>
        <input type="hidden" name="tab" value={params.tab ?? ''} />
        <Button type="submit">Найти</Button>
      </form>
      {data && courses && lessons ? (
        <>
          <nav className="filter-tabs" aria-label="Результаты поиска">
            <Link
              className={'filter-tab ' + (!isLessons ? 'active' : '')}
              href={'/search?' + new URLSearchParams({ q: params.q! })}
            >
              Программы · {courses.total}
            </Link>
            <Link
              className={'filter-tab ' + (isLessons ? 'active' : '')}
              href={'/search?' + new URLSearchParams({ q: params.q!, tab: 'lessons' })}
            >
              Уроки · {lessons.total}
            </Link>
          </nav>
          {data.items.length ? (
            isLessons ? (
              <LessonResults items={lessons.items} />
            ) : (
              <div className="course-grid">
                {courses.items.map((c) => (
                  <CourseCard key={c.id} course={c} />
                ))}
              </div>
            )
          ) : (
            <EmptyState
              title="Пока ничего не нашлось"
              description="Попробуйте более короткий запрос или другое слово."
            />
          )}
          <Pagination {...data} path="/search" query={params} />
        </>
      ) : (
        <EmptyState
          icon={<Search size={26} />}
          title="С чего начнём?"
          description="Введите название темы или несколько слов из урока."
        />
      )}
    </>
  );
}
