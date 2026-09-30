import Link from 'next/link';
import { ArrowUpRight, Clock3, Layers } from 'lucide-react';
import type { CourseCard as Card } from '@/lib/server/data';
import { durationLabel } from '@/lib/utils';
import { Badge, ProgressBar } from './ui';
export function CourseCard({ course }: { course: Card }) {
  return (
    <article className="course-card">
      <Link
        href={`/courses/${course.slug}`}
        className={`course-cover cover-${course.accent}`}
        aria-label={`Открыть курс ${course.title}`}
      >
        {course.cover_id && (
          /* Private assets are deliberately excluded from the shared image optimizer. */ <img
            src={`/api/media/${course.cover_id}`}
            alt=""
            loading="lazy"
          />
        )}
        <span className="cover-index">ПРОГРАММА / {course.lesson_count} УРОКА</span>
        <span className="cover-arrow">
          <ArrowUpRight size={21} />
        </span>
      </Link>
      <div className="course-card-body">
        <Badge tone={course.accent}>{course.category_name ?? 'Программа'}</Badge>
        <h3>
          <Link href={`/courses/${course.slug}`}>{course.title}</Link>
        </h3>
        <p>{course.summary}</p>
        <div className="course-meta">
          <span>
            <Layers size={14} />
            {course.lesson_count} урока
          </span>
          <span>
            <Clock3 size={14} />
            {durationLabel(course.duration)}
          </span>
        </div>
        {course.progress > 0 ? (
          <ProgressBar value={course.progress} />
        ) : (
          <div className="course-author">{course.author}</div>
        )}
      </div>
    </article>
  );
}
