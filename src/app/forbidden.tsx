import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';
import { EmptyState } from '@/components/ui';
export default function Forbidden() {
  return (
    <main id="main-content" className="loading-page">
      <EmptyState
        icon={<ShieldAlert size={28} />}
        title="Недостаточно прав"
        description="Этот раздел доступен сотрудникам с соответствующими полномочиями."
        action={
          <Link className="button button-primary" href="/dashboard">
            К моему обучению
          </Link>
        }
      />
    </main>
  );
}
