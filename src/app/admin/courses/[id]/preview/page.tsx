import { watermarkLabel } from '@/lib/watermark';
import Link from 'next/link';
import { ArrowLeft, Eye } from 'lucide-react';
import { getCourseById, getSettings } from '@/lib/server/data';
import { requireActor } from '@/lib/server/auth';
import { BlockRenderer } from '@/components/block-renderer';
import { PageHeading, EmptyState, Badge } from '@/components/ui';
export default async function Preview({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ lesson?: string }>;
}) {
  const { id } = await params,
    { lesson: lessonId } = await searchParams;
  const [actor, course, settings] = await Promise.all([
    requireActor('staff'),
    getCourseById(id, true),
    getSettings(),
  ]);
  const lessons = course.modules.flatMap((m) => m.lessons),
    lesson = lessons.find((l) => l.id === lessonId) ?? lessons[0];
  return (
    <>
      <div className="notice">
        <Eye size={17} /> Предпросмотр рабочего черновика. Ученикам доступна только опубликованная
        редакция.
      </div>
      <PageHeading
        title={course.title}
        action={
          <Link
            className="button button-secondary"
            href={`/admin/courses/${id}${lesson ? `?lesson=${lesson.id}` : ''}`}
          >
            <ArrowLeft size={16} />В редактор
          </Link>
        }
      />
      <div className="preview-layout">
        <nav className="panel preview-nav" aria-label="Уроки предпросмотра">
          {course.modules.map((m) => (
            <div key={m.id}>
              <strong>{m.title}</strong>
              {m.lessons.map((l) => (
                <Link
                  key={l.id}
                  href={`/admin/courses/${id}/preview?lesson=${l.id}`}
                  className={l.id === lesson?.id ? 'active' : ''}
                >
                  {l.title}
                  {!l.published && <Badge>Черновик</Badge>}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <article className="preview-content">
          {lesson ? (
            <>
              <h2>{lesson.title}</h2>
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
                preview
              />
            </>
          ) : (
            <EmptyState
              title="Пока нет уроков"
              description="Добавьте структуру и материалы в редакторе курса."
            />
          )}
        </article>
      </div>
    </>
  );
}
