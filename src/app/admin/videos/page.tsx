import { requireActor } from '@/lib/server/auth';
import { operations } from '@/lib/server/operations';
import { getSettings } from '@/lib/server/data';
import type { VideoJob } from '@/lib/operations';
import { PageHeading } from '@/components/ui';
import { VideoManagement } from '@/components/video-management';
export const metadata = { title: 'Обработка видео' };
export default async function Videos() {
  await requireActor('staff');
  const [jobs, settings] = await Promise.all([operations<VideoJob[]>('video.list'), getSettings()]);
  return (
    <>
      <PageHeading title="Обработка видео" description="Ваши видео с названием академии в кадре." />
      <VideoManagement jobs={jobs} brand={settings.brand_name} />
    </>
  );
}
