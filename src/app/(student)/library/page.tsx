export const metadata = { title: 'Материалы' };
import { Download, FileText, Search } from 'lucide-react';
import Link from 'next/link';
import { getLibrary, pageNumber } from '@/lib/server/data';
import { formatBytes } from '@/lib/files';
import { PageHeading, Input, Button, EmptyState, Pagination } from '@/components/ui';
export default async function Library({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const params = await searchParams,
    files = await getLibrary(params.q ?? '', pageNumber(params.page));
  return (
    <>
      <PageHeading
        eyebrow="ВАША БИБЛИОТЕКА"
        title="Знания под рукой"
        description="Рабочие тетради, шаблоны и материалы из доступных уроков."
      />
      <form className="filters" action="/library">
        <div className="search-input">
          <Search size={17} />
          <Input
            name="q"
            aria-label="Поиск материалов"
            placeholder="Название файла или урока"
            defaultValue={params.q}
          />
        </div>
        <Button variant="secondary">Найти</Button>
      </form>
      {files.items.length ? (
        <div className="material-list">
          {files.items.map((f) => (
            <article className="material-row" key={`${f.id}-${f.lesson_slug}`}>
              <div className="material-row-main">
                <span className="file-icon">
                  <FileText size={22} />
                </span>
                <div>
                  <h3>{f.filename}</h3>
                  <p>
                    <Link href={`/courses/${f.course_slug}/lessons/${f.lesson_slug}`}>
                      {f.course_title} · {f.lesson_title}
                    </Link>{' '}
                    · {formatBytes(f.size_bytes)}
                  </p>
                </div>
              </div>
              <a
                href={`/api/media/${f.id}?download=1`}
                className="button button-secondary"
                aria-label={`Скачать ${f.filename}`}
              >
                <Download size={16} />
                <span>Скачать</span>
              </a>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          title="Материалов пока нет"
          description="Файлы появятся здесь, когда вы получите доступ к урокам. Если включено последовательное прохождение, сначала завершите предыдущие уроки."
        />
      )}
      <Pagination {...files} path="/library" query={params} />
    </>
  );
}
