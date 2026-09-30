'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { Copy, Pencil, Trash2, LoaderCircle } from 'lucide-react';
import { toast } from 'sonner';
import { deleteCourse, duplicateCourse } from '@/lib/actions/content';
import { ConfirmDialog } from './confirm-dialog';
export function AdminCourseActions({
  id,
  title,
  admin,
}: {
  id: string;
  title: string;
  admin: boolean;
}) {
  const router = useRouter(),
    [pending, start] = useTransition();
  return (
    <div className="table-actions">
      <Link
        className="icon-button"
        href={`/admin/courses/${id}`}
        aria-label={`Редактировать ${title}`}
      >
        <Pencil size={16} />
      </Link>
      <button
        className="icon-button"
        disabled={pending}
        aria-label={`Дублировать ${title}`}
        onClick={() =>
          start(async () => {
            const r = await duplicateCourse(id);
            if (r.ok && r.data) {
              toast.success('Независимая копия создана');
              router.push(`/admin/courses/${r.data.id}`);
            } else if (!r.ok) toast.error(r.error);
          })
        }
      >
        {pending ? <LoaderCircle size={16} className="spin" /> : <Copy size={16} />}
      </button>
      {admin && (
        <ConfirmDialog
          title="Архивировать курс?"
          description={`«${title}» станет недоступен ученикам. История прохождения сохранится.`}
          confirmLabel="Архивировать"
          danger
          trigger={
            <button className="icon-button" aria-label={`Архивировать ${title}`}>
              <Trash2 size={16} />
            </button>
          }
          onConfirm={async () => {
            const r = await deleteCourse(id);
            if (!r.ok) {
              toast.error(r.error);
              return false;
            }
            toast.success('Курс архивирован');
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
