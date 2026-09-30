import Link from 'next/link';
import { ArrowLeft, ArrowRight, BookOpen, LoaderCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
export function Button({
  className,
  variant = 'primary',
  busy,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  busy?: boolean;
}) {
  return (
    <button
      {...props}
      disabled={props.disabled || busy}
      className={cn('button', `button-${variant}`, className)}
    >
      {busy && <LoaderCircle size={17} className="spin" />}
      {children}
    </button>
  );
}
export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn('input', className)} />;
}
export { Field } from './field';
export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: string }) {
  return <span className={cn('badge', `badge-${tone}`)}>{children}</span>;
}
export function EmptyState({
  title = 'Здесь пока ничего нет',
  description,
  action,
  icon,
}: {
  title?: string;
  description: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon ?? <BookOpen size={26} />}</div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}
export function ProgressBar({ value, label = true }: { value: number; label?: boolean }) {
  return (
    <div className="progress-wrap">
      <div
        className="progress-track"
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Прогресс курса"
      >
        <div style={{ width: `${value}%` }} />
      </div>
      {label && <span>{value}%</span>}
    </div>
  );
}
export function Pagination({
  total,
  page,
  pageSize,
  path,
  query = {},
}: {
  total: number;
  page: number;
  pageSize: number;
  path: string;
  query?: Record<string, string | undefined>;
}) {
  const pages = Math.ceil(total / pageSize);
  if (pages <= 1) return null;
  const href = (p: number) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (v) params.set(k, v);
    params.set('page', String(p));
    return `${path}?${params}`;
  };
  return (
    <nav className="pagination" aria-label="Страницы результатов">
      {page > 1 ? (
        <Link className="button button-secondary" href={href(page - 1)}>
          <ArrowLeft size={16} /> Назад
        </Link>
      ) : (
        <span />
      )}
      <span>
        Страница {page} из {pages}
      </span>
      {page < pages ? (
        <Link className="button button-secondary" href={href(page + 1)}>
          Далее <ArrowRight size={16} />
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} aria-hidden="true" />;
}
