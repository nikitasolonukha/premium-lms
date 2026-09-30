export const metadata = { title: 'Сохранённое' };
import { getCatalog, getLessonIndex, pageNumber } from '@/lib/server/data';
import { PageHeading, EmptyState, Pagination } from '@/components/ui';
import { CourseCard } from '@/components/course-card';
import { LessonResults } from '@/components/lesson-results';
import Link from 'next/link';
import { Bookmark } from 'lucide-react';
export default async function Saved({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; tab?: string }>;
}) {
  const params = await searchParams,
    page = pageNumber(params.page),
    isLessons = params.tab === 'lessons';
  const [courses, lessons] = await Promise.all([
    getCatalog({ saved: true, page: isLessons ? 1 : page }),
    getLessonIndex('', isLessons ? page : 1, true),
  ]);
  const data = isLessons ? lessons : courses;
  return (
    <>
      <PageHeading
        title="Сохранённое"
        description="Программы и уроки, к которым вы хотите вернуться."
      />
      <nav className="filter-tabs" aria-label="Виды сохранённого">
        <Link className={'filter-tab ' + (!isLessons ? 'active' : '')} href="/saved">
          Программы · {courses.total}
        </Link>
        <Link className={'filter-tab ' + (isLessons ? 'active' : '')} href="/saved?tab=lessons">
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
          icon={<Bookmark size={25} />}
          title="Сохраните то, что интересно"
          description="Нажмите значок закладки на странице курса или урока — материал появится здесь."
          action={
            <Link className="button button-primary" href="/courses">
              Найти программу
            </Link>
          }
        />
      )}
      <Pagination {...data} path="/saved" query={{ tab: params.tab }} />
    </>
  );
}
