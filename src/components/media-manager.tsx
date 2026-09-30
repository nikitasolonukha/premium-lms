'use client';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { deleteMedia } from '@/lib/actions/content';
import { ConfirmDialog } from './confirm-dialog';
import { Uploader } from './uploader';
export function MediaUpload() {
  const router = useRouter();
  return (
    <Uploader
      onChange={() => {
        toast.success('Файл добавлен в медиатеку');
        router.refresh();
      }}
    />
  );
}
export function MediaDelete({ id, filename }: { id: string; filename: string }) {
  const router = useRouter();
  return (
    <ConfirmDialog
      title="Удалить файл из медиатеки?"
      description={`«${filename}» будет скрыт. Материалы, используемые в курсах, удалить нельзя.`}
      danger
      confirmLabel="Удалить"
      trigger={
        <button className="icon-button" aria-label={`Удалить файл ${filename}`}>
          <Trash2 size={17} />
        </button>
      }
      onConfirm={async () => {
        const r = await deleteMedia(id);
        if (!r.ok) {
          toast.error(r.error);
          return false;
        }
        toast.success('Файл удалён');
        router.refresh();
      }}
    />
  );
}
