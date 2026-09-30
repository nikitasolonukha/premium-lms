'use client';
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Bookmark, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { recordProgress, saveItem } from '@/lib/actions/content';
import { Button } from './ui';
export function SaveButton({
  courseId,
  lessonId = null,
  initial = false,
  compact = false,
}: {
  courseId: string;
  lessonId?: string | null;
  initial?: boolean;
  compact?: boolean;
}) {
  const [saved, setSaved] = useState(initial),
    [pending, start] = useTransition();
  return (
    <Button
      variant="secondary"
      busy={pending}
      aria-pressed={saved}
      aria-label={saved ? 'Удалить из сохранённого' : 'Сохранить'}
      onClick={() =>
        start(async () => {
          const result = await saveItem(courseId, lessonId, !saved);
          if (result.ok) {
            setSaved(!saved);
            toast.success(result.data?.message);
          } else toast.error(result.error);
        })
      }
    >
      <Bookmark size={17} fill={saved ? 'currentColor' : 'none'} />
      {!compact && (saved ? 'Сохранено' : 'Сохранить')}
    </Button>
  );
}
export function LessonControls({
  lessonId,
  completed,
  previous,
  next,
  courseHref,
}: {
  lessonId: string;
  completed: boolean;
  previous?: string;
  next?: string;
  courseHref: string;
}) {
  const [done, setDone] = useState(completed),
    [pending, start] = useTransition();
  const router = useRouter();
  useEffect(() => {
    void recordProgress(lessonId).then((result) => {
      if (!result.ok) toast.error(result.error);
    });
  }, [lessonId]);
  return (
    <div className="lesson-controls">
      <div>
        {previous ? (
          <Link href={previous} className="button button-secondary" aria-label="Предыдущий урок">
            <ChevronLeft size={18} />
            <span>Назад</span>
          </Link>
        ) : (
          <span />
        )}
      </div>
      <Button
        variant={done ? 'secondary' : 'primary'}
        busy={pending}
        disabled={done}
        onClick={() =>
          start(async () => {
            const result = await recordProgress(lessonId, true);
            if (result.ok) {
              setDone(true);
              toast.success('Отлично, урок завершён');
              router.refresh();
            } else toast.error(result.error);
          })
        }
      >
        <Check size={17} />
        {done ? 'Урок завершён' : 'Завершить урок'}
      </Button>
      <Link
        href={next ?? courseHref}
        className="button button-secondary"
        aria-label={next ? 'Следующий урок' : 'К программе'}
      >
        <span>{next ? 'Следующий' : 'К программе'}</span>
        <ChevronRight size={18} />
      </Link>
    </div>
  );
}
