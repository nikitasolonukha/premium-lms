import Link from 'next/link';
import { EmptyState } from '@/components/ui';
export default function NotFound() {
  return (
    <main id="main-content" className="loading-page">
      <EmptyState
        title="Страница недоступна"
        description="Возможно, адрес изменился или у вас нет доступа к этому материалу."
        action={
          <Link href="/dashboard" className="button button-primary">
            На главную
          </Link>
        }
      />
    </main>
  );
}
