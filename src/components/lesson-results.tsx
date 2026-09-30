import Link from 'next/link';
import { ArrowUpRight, LockKeyhole } from 'lucide-react';
import type { LessonIndexRow } from '@/lib/server/data';
export function LessonResults({ items }: { items: LessonIndexRow[] }) {
  return (
    <div className="material-list">
      {items.map((l) => (
        <Link
          className="material-row"
          key={l.lesson_id}
          href={`/courses/${l.course_slug}/lessons/${l.slug}`}
        >
          <div>
            <h3>{l.title}</h3>
            <p>
              {l.course_title}
              {!l.available ? ' · Сначала завершите предыдущие уроки' : ''}
            </p>
          </div>
          {l.available ? <ArrowUpRight size={20} /> : <LockKeyhole size={20} />}
        </Link>
      ))}
    </div>
  );
}
