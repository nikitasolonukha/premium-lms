import { Skeleton } from '@/components/ui';
export default function Loading() {
  return (
    <div className="loading-page" role="status" aria-label="Загрузка страницы">
      <Skeleton className="skeleton-title" />
      <Skeleton className="skeleton-subtitle" />
      <Skeleton className="skeleton-hero" />
      <div className="course-grid">
        {[1, 2, 3].map((x) => (
          <Skeleton key={x} className="skeleton-card" />
        ))}
      </div>
    </div>
  );
}
