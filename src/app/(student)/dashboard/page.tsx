import { privateImage } from '@/lib/media-images';
export const metadata = { title: 'Моё обучение' };
import Link from 'next/link';
import {
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Download,
  FileText,
  Play,
  Sparkles,
} from 'lucide-react';
import { requireActor } from '@/lib/server/auth';
import {
  getCatalog,
  getCourseById,
  getProgress,
  getLibrary,
  flattenLessons,
  getStudentSummary,
  getLessonIndex,
} from '@/lib/server/data';
import { nextLesson } from '@/lib/domain';
import { dateLabel } from '@/lib/utils';
import { LessonResults } from '@/components/lesson-results';
import { CourseCard } from '@/components/course-card';
import { EmptyState, ProgressBar } from '@/components/ui';
export default async function Dashboard() {
  const [actor, catalog, library, summary, saved, newest] = await Promise.all([
    requireActor(),
    getCatalog(),
    getLibrary(),
    getStudentSummary(),
    getLessonIndex('', 1, true),
    getCatalog({ sort: 'newest' }),
  ]);
  const active =
    catalog.items.find((c) => c.last_activity && c.progress < 100) ??
    catalog.items.find((c) => c.progress < 100) ??
    catalog.items[0];
  const [course, progress] = active
    ? await Promise.all([getCourseById(active.id), getProgress(active.id)])
    : [null, []];
  const lessons = course ? flattenLessons(course) : [];
  const done = progress.filter((p) => p.completed_at).map((p) => p.lesson_id),
    nextId = nextLesson(
      lessons.map((l) => l.id),
      done,
      course?.sequential ? null : active?.last_lesson_id,
    ),
    lesson = lessons.find((l) => l.id === nextId);
  const href =
    course && lesson
      ? `/courses/${course.slug}/lessons/${lesson.slug}`
      : course
        ? `/courses/${course.slug}`
        : '/courses';
  return (
    <>
      <div className="dashboard-intro">
        <div>
          <h1>
            Привет, {actor.profile.first_name || 'студент'}
            <span className="greeting-dot">.</span>
          </h1>
          <p>Хороший день, чтобы узнать что-то новое.</p>
        </div>
        <span className="date-mark">
          {dateLabel(new Date().toISOString()).toUpperCase()} / ВАШ ЛИЧНЫЙ КАБИНЕТ
        </span>
      </div>
      {active && course ? (
        <>
          <section className="continue-card">
            <div className="continue-copy">
              <div className="eyebrow">
                <span className="status-dot" />
                {active.progress === 100
                  ? 'ПРОГРАММА ЗАВЕРШЕНА'
                  : active.progress > 0
                    ? 'ПРОДОЛЖИМ С ТОГО МЕСТА'
                    : 'ВАШ СЛЕДУЮЩИЙ ШАГ'}
              </div>
              <h2>{course.title}</h2>
              <p>
                {lesson
                  ? `${lesson.moduleTitle} · ${lesson.title}`
                  : 'Вы завершили все опубликованные уроки. Можно вернуться к материалам.'}
              </p>
              <ProgressBar value={active.progress} />
              <Link className="button button-primary" href={href}>
                {active.progress === 100 ? <CheckCircle2 size={17} /> : <Play size={16} />}{' '}
                {active.progress === 100
                  ? 'Вернуться к программе'
                  : active.progress > 0
                    ? 'Продолжить обучение'
                    : 'Начать обучение'}
                <ArrowRight size={17} />
              </Link>
            </div>
            <div className="continue-cover">
              {course.coverId && (
                <img {...privateImage(course.coverId)} alt="" fetchPriority="high" />
              )}
              <div className="continue-cover-caption">
                <span className="play-circle">
                  {active.progress === 100 ? <CheckCircle2 size={18} /> : <Play size={16} />}
                </span>
                <div>
                  <small>
                    {active.last_activity
                      ? `ПОСЛЕДНЯЯ АКТИВНОСТЬ · ${dateLabel(active.last_activity).toUpperCase()}`
                      : 'В УДОБНОМ ДЛЯ ВАС ТЕМПЕ'}
                  </small>
                  <strong>{lesson?.title ?? 'Все уроки пройдены'}</strong>
                </div>
              </div>
            </div>
          </section>
          <div className="activity-strip">
            <div>
              <strong>{catalog.total}</strong>
              <span>доступные программы</span>
            </div>
            <div>
              <strong>{summary.completedLessons}</strong>
              <span>уроков завершено</span>
            </div>
            <div>
              <Sparkles size={16} />
              <span>В вашем темпе</span>
            </div>
          </div>
        </>
      ) : (
        <EmptyState
          title="Ваше обучение начинается здесь"
          description="Как только вам назначат программу, она появится на этой странице."
          action={
            <Link href="/courses" className="button button-primary">
              Посмотреть программы
            </Link>
          }
        />
      )}
      <div className="section-heading">
        <h2>
          Мои программы<span className="count">{catalog.total}</span>
        </h2>
        <Link href="/courses" className="text-link">
          Все программы <ArrowUpRight size={16} />
        </Link>
      </div>
      <div className="course-grid">
        {catalog.items.slice(0, 3).map((c) => (
          <CourseCard key={c.id} course={c} />
        ))}
      </div>
      <div className="section-heading">
        <h2>Материалы для практики</h2>
        <Link href="/library" className="text-link">
          Все материалы <ArrowUpRight size={16} />
        </Link>
      </div>
      {library.items.length ? (
        <div className="material-list">
          {library.items.slice(0, 3).map((file) => (
            <article className="material-row" key={`${file.id}-${file.lesson_slug}`}>
              <div className="material-row-main">
                <span className="file-icon">
                  <FileText size={20} />
                </span>
                <div>
                  <h3>{file.filename}</h3>
                  <p>
                    {file.course_title} · {file.lesson_title}
                  </p>
                </div>
              </div>
              <a
                href={`/api/media/${file.id}?download=1`}
                className="button button-secondary"
                aria-label={`Скачать ${file.filename}`}
              >
                <Download size={16} />
                <span>Скачать</span>
              </a>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          title="Материалы появятся по ходу обучения"
          description="Здесь будут рабочие тетради, шаблоны и полезные файлы из доступных уроков."
        />
      )}
      <div className="section-heading">
        <h2>Новое в академии</h2>
        <Link href="/courses?sort=newest" className="text-link">
          Все обновления <ArrowUpRight size={16} />
        </Link>
      </div>
      <div className="course-grid">
        {newest.items.slice(0, 3).map((c) => (
          <CourseCard key={c.id} course={c} />
        ))}
      </div>
      <div className="section-heading">
        <h2>Сохранённое</h2>
        <Link href="/saved" className="text-link">
          Открыть всё <ArrowUpRight size={16} />
        </Link>
      </div>
      {saved.items.length ? (
        <LessonResults items={saved.items.slice(0, 3)} />
      ) : (
        <div className="notice">Отмечайте важные уроки закладкой — они будут здесь.</div>
      )}
    </>
  );
}
