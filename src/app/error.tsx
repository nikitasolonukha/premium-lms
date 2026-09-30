'use client';
import { Button, EmptyState } from '@/components/ui';
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main id="main-content" className="loading-page">
      <EmptyState
        title="Не удалось загрузить страницу"
        description="Проверьте соединение и повторите попытку. Ваши сохранённые данные остаются на месте."
        action={<Button onClick={reset}>Попробовать снова</Button>}
      />
    </main>
  );
}
