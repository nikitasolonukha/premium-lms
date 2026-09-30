'use client';
import { useEffect, useState, useTransition } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { courseFilterOptions } from '@/lib/actions/users';
import type { CourseCard, PageData } from '@/lib/server/data';
import { Button, Input } from './ui';
export function CourseFilter({
  initialId = '',
  initialTitle = '',
}: {
  initialId?: string;
  initialTitle?: string;
}) {
  const [id, setId] = useState(initialId),
    [title, setTitle] = useState(initialTitle),
    [open, setOpen] = useState(false),
    [q, setQ] = useState(''),
    [page, setPage] = useState(1),
    [data, setData] = useState<PageData<CourseCard> | null>(null),
    [error, setError] = useState(''),
    [busy, start] = useTransition();
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const timer = setTimeout(
      () =>
        start(async () => {
          const result = await courseFilterOptions({ q, page });
          if (cancelled) return;
          if (result.ok && result.data) {
            setData(result.data);
            setError('');
          } else if (!result.ok) setError(result.error);
        }),
      250,
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, q, page]);
  return (
    <div className="course-filter">
      <input type="hidden" name="course" value={id} />
      <Button
        type="button"
        variant="secondary"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {title || 'Все курсы'}
      </Button>
      {open && (
        <div className="course-filter-panel">
          <div className="form-row">
            <Input
              aria-label="Найти курс для фильтра"
              placeholder="Название курса"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
            <button
              type="button"
              className="icon-button"
              aria-label="Закрыть выбор курса"
              onClick={() => setOpen(false)}
            >
              <X size={17} />
            </button>
          </div>
          <button
            type="button"
            className="course-filter-option"
            onClick={() => {
              setId('');
              setTitle('');
              setOpen(false);
            }}
          >
            Все курсы
          </button>
          {error && <p role="alert">{error}</p>}
          {data?.items.map((course) => (
            <button
              key={course.id}
              type="button"
              className="course-filter-option"
              onClick={() => {
                setId(course.id);
                setTitle(course.title);
                setOpen(false);
              }}
            >
              {course.title}
            </button>
          ))}
          {busy && <p role="status">Загружаем…</p>}
          {data && !data.items.length && <p>Курсы не найдены.</p>}
          {data && data.total > data.pageSize && (
            <div className="assignment-pagination">
              <Button
                type="button"
                variant="ghost"
                aria-label="Предыдущие курсы"
                disabled={page === 1 || busy}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft size={17} />
              </Button>
              <span>
                {page} / {Math.ceil(data.total / data.pageSize)}
              </span>
              <Button
                type="button"
                variant="ghost"
                aria-label="Следующие курсы"
                disabled={page * data.pageSize >= data.total || busy}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight size={17} />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
