import { watermarkLabel } from '@/lib/watermark';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { ChevronRight, Clock3, LockKeyhole } from 'lucide-react';
import { getCourseBySlug, getProgress, flattenLessons, getSettings } from '@/lib/server/data';
import { requireActor } from '@/lib/server/auth';
import { userClient } from '@/lib/server/supabase';
import { completionState, progressPercent } from '@/lib/domain';
import { durationLabel } from '@/lib/utils';
import { Curriculum, MobileCurriculum } from '@/components/curriculum';
import { BlockRenderer } from '@/components/block-renderer';
import { LessonControls, SaveButton } from '@/components/learning-controls';
import { EmptyState, ProgressBar } from '@/components/ui';
export default async function LessonPage({
  params,
}: {
  params: Promise<{ slug: string; lessonSlug: string }>;
}) {
  const { slug, lessonSlug } = await params,
    course = await getCourseBySlug(slug);
  const [progress, actor, settings] = await Promise.all([
    getProgress(course.id),
    requireActor(),
    getSettings(),
  ]);
  const lessons = flattenLessons(course),
    lesson = lessons.find((l) => l.slug === lessonSlug);
  if (!lesson) {
    const alias = await (
      await userClient()
    )
      .from('lesson_slug_aliases')
      .select('lesson_id')
      .eq('course_id', course.id)
      .eq('slug', lessonSlug)
      .single();
    const target = lessons.find((l) => l.id === alias.data?.lesson_id);
    if (target) permanentRedirect(`/courses/${slug}/lessons/${target.slug}`);
    notFound();
  }
  const ids = lessons.map((l) => l.id),
    done = progress.filter((p) => p.completed_at).map((p) => p.lesson_id),
    state = completionState(lesson.id, ids, done, course.sequential),
    index = ids.indexOf(lesson.id),
    href = (i: number) => (lessons[i] ? `/courses/${slug}/lessons/${lessons[i].slug}` : undefined);
  const saved = await (
    await userClient()
  )
    .from('saved_items')
    .select('id')
    .eq('lesson_id', lesson.id);
  const program = {
    modules: course.modules.map((m) => ({
      ...m,
      lessons: m.lessons
        .filter((l) => l.published)
        .map(({ id, title, slug, duration }) => ({ id, title, slug, duration })),
    })),
    courseSlug: slug,
    completed: done,
    sequential: course.sequential,
    currentId: lesson.id,
  };
  return (
    <>
      <nav className="breadcrumbs">
        <Link href="/courses">Программы</Link>
        <ChevronRight size={13} />
        <Link href={`/courses/${slug}`}>{course.title}</Link>
        <ChevronRight size={13} />
        <span>Урок {index + 1}</span>
      </nav>
      <div className="lesson-layout">
        <article className="lesson-main">
          <div className="lesson-heading">
            <div className="eyebrow">
              {lesson.moduleTitle} / УРОК {String(index + 1).padStart(2, '0')}
            </div>
            <h1>{lesson.title}</h1>
            <div className="lesson-heading-meta">
              <span>
                <Clock3 size={14} />
                {durationLabel(lesson.duration)}
              </span>
              <SaveButton
                key={`saved-${lesson.id}`}
                courseId={course.id}
                lessonId={lesson.id}
                initial={!!saved.data?.length}
                compact
              />
            </div>
            <MobileCurriculum {...program} />
          </div>
          {state === 'locked' ? (
            <EmptyState
              icon={<LockKeyhole size={26} />}
              title="Этот урок пока закрыт"
              description="Завершите предыдущие уроки программы, чтобы продолжить."
              action={
                <Link
                  className="button button-primary"
                  href={
                    href(
                      Math.max(
                        0,
                        ids.findIndex((id) => !done.includes(id)),
                      ),
                    ) ?? `/courses/${slug}`
                  }
                >
                  К доступному уроку
                </Link>
              }
            />
          ) : (
            <>
              <BlockRenderer
                blocks={lesson.blocks}
                lessonId={lesson.id}
                viewer={watermarkLabel(actor, settings.watermark_mode)}
                watermark={settings.content_watermark_enabled}
                watermarkOptions={{
                  brandName: settings.brand_name,
                  intervalSeconds: settings.watermark_interval_seconds,
                  opacity: settings.watermark_opacity,
                }}
              />
              <LessonControls
                key={lesson.id}
                lessonId={lesson.id}
                completed={state === 'completed'}
                previous={href(index - 1)}
                next={href(index + 1)}
                courseHref={`/courses/${slug}`}
              />
            </>
          )}
        </article>
        <aside className="lesson-sidebar">
          <div className="lesson-sidebar-head">
            <Link href={`/courses/${slug}`}>{course.title}</Link>
            <ProgressBar value={progressPercent(ids, done)} />
          </div>
          <Curriculum {...program} compact />
        </aside>
      </div>
    </>
  );
}
