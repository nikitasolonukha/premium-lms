import { requireActor } from '@/lib/server/auth';
import { userClient } from '@/lib/server/supabase';
import { privilegedClient } from '@/lib/server/privileged';
import { notFound } from 'next/navigation';
import { uuid } from '@/lib/schemas';
import { PageHeading } from '@/components/ui';
export const metadata = { title: 'Просмотр обработанного видео' };
export default async function Preview({ params }: { params: Promise<{ id: string }> }) {
  await requireActor('staff');
  const { id } = await params;
  if (!uuid.safeParse(id).success) notFound();
  const { data } = await (
    await userClient()
  )
    .from('media')
    .select('object_key,filename')
    .eq('id', id)
    .eq('status', 'ready')
    .eq('mime_type', 'video/mp4')
    .single();
  if (!data) notFound();
  const signed = await privilegedClient()
    .storage.from('academy-private')
    .createSignedUrl(data.object_key, 300);
  if (signed.error) throw new Error('VIDEO_PREVIEW_UNAVAILABLE');
  return (
    <>
      <PageHeading
        title={data.filename}
        description="Обработанная версия. Ссылка на просмотр действует 5 минут."
      />
      <video
        className="processed-preview"
        src={signed.data.signedUrl}
        controls
        preload="metadata"
        playsInline
      />
    </>
  );
}
