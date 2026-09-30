import Link from 'next/link';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Layers,
  Play,
  Download,
  FileText,
} from 'lucide-react';
import { getCourseBySlug, getProgress, flattenLessons, getCategories } from '@/lib/server/data';
import { nextLesson, progressPercent } from '@/lib/domain';
import { durationLabel, initials } from '@/lib/utils';
import { userClient } from '@/lib/server/supabase';
import { Badge, ProgressBar } from '@/components/ui';
import { Curriculum } from '@/components/curriculum';
import { SaveButton } from '@/components/learning-controls';
export default async function CoursePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params,
    course = await getCourseBySlug(slug);
  const [progress, categories, saved] = await Promise.all([
    getProgress(course.id),
    getCategories(),
    (await userClient())
      .from('saved_items')
      .select('id')
      .eq('course_id', course.id)
      .is('lesson_id', null),
  ]);
  const lessons = flattenLessons(course),
    done = progress.filter((p) => p.completed_at).map((p) => p.lesson_id),
    ids = lessons.map((l) => l.id),
    percent = progressPercent(ids, done),
    resume = nextLesson(ids, done, course.sequential ? null : progress[0]?.lesson_id),
    next = lessons.find((l) => l.id === resume),
    category = categories.find((c) => c.id === course.categoryId);
  const materials = lessons.flatMap((l) =>
    l.blocks
      .filter((b) => b.type === 'file')
      .map((b) => ({ id: b.id, assetId: b.data.assetId, label: b.data.label, lesson: l.title })),
  );
  const modules = course.modules.map((m) => ({
    ...m,
    lessons: m.lessons
      .filter((l) => l.published)
      .map(({ id, title, slug, duration }) => ({ id, title, slug, duration })),
  }));
  return (
    <>
      <nav className="breadcrumbs">
        <Link href="/courses">Программы</Link>
        <ChevronRight size={13} />
        <span>{course.title}</span>
      </nav>
      <section className="course-intro">
        <div className="course-intro-copy">
          <Badge tone={course.accent}>{category?.name ?? 'Программа'}</Badge>
          <h1>{course.title}</h1>
          <p>{course.summary}</p>
          <div className="course-intro-meta">
            <span>
              <Layers size={16} />
              {lessons.length} урока
            </span>
            <span>
              <Clock3 size={16} />
              {durationLabel(lessons.reduce((n, l) => n + l.duration, 0))}
            </span>
            <span>
              <BookOpen size={16} />В своём темпе
            </span>
          </div>
          <div className="author-line">
            <span className="avatar">
              {initials(course.author.split(' ')[0], course.author.split(' ')[1])}
            </span>
            <div>
              <small>АВТОР ПРОГРАММЫ</small>
              <strong>{course.author}</strong>
            </div>
          </div>
          <div className="course-intro-actions">
            {next ? (
              <Link
                className="button button-primary"
                href={`/courses/${slug}/lessons/${next.slug}`}
              >
                <Play size={16} />
                {percent > 0 ? 'Продолжить обучение' : 'Начать обучение'}
                <ArrowRight size={17} />
              </Link>
            ) : (
              <span className="completion-badge">
                <CheckCircle2 size={18} />
                Программа завершена
              </span>
            )}
            <SaveButton courseId={course.id} initial={!!saved.data?.length} />
          </div>
        </div>
        <div className={`course-intro-cover cover-${course.accent}`}>
          {course.coverId && (
            <img src={`/api/media/${course.coverId}`} alt="" fetchPriority="high" />
          )}
        </div>
      </section>
      <div className="course-body-layout">
        <div>
          <section className="course-description">
            <div className="eyebrow">О ПРОГРАММЕ</div>
            <h2>От понимания — к действию</h2>
            {course.description.split('\n\n').map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </section>
          <div className="section-heading">
            <h2>Программа курса</h2>
            <span className="muted text-small">
              {course.modules.length} модуля · {lessons.length} урока
            </span>
          </div>
          <Curriculum
            modules={modules}
            courseSlug={slug}
            completed={done}
            sequential={course.sequential}
          />
          {materials.length > 0 && (
            <>
              <div className="section-heading">
                <h2>Материалы программы</h2>
              </div>
              <div className="material-list">
                {materials.map((f) => (
                  <article className="material-row" key={f.id}>
                    <div className="material-row-main">
                      <FileText size={20} />
                      <div>
                        <h3>{f.label}</h3>
                        <p>{f.lesson}</p>
                      </div>
                    </div>
                    <a
                      className="button button-secondary"
                      href={'/api/media/' + f.assetId + '?download=1'}
                    >
                      <Download size={16} />
                      Скачать
                    </a>
                  </article>
                ))}
              </div>
            </>
          )}
        </div>
        <aside className="course-progress-panel">
          <div className="panel">
            <div className="eyebrow">ВАШ ПРОГРЕСС</div>
            <div className="large-progress">
              {percent}
              <span>%</span>
            </div>
            <ProgressBar value={percent} label={false} />
            <p>
              {ids.filter((id) => done.includes(id)).length} из {lessons.length} уроков завершено
            </p>
            {course.sequential && (
              <div className="sequence-note">
                Уроки открываются последовательно, после завершения предыдущего.
              </div>
            )}
            <div className="course-tags">
              {course.tags.map((tag) => (
                <Badge key={tag}>{tag}</Badge>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
