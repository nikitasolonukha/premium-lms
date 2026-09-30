export const metadata = { title: 'Настройки' };
import { requireActor } from '@/lib/server/auth';
import { getSettings } from '@/lib/server/data';
import { PageHeading } from '@/components/ui';
import { SettingsForm } from '@/components/settings-form';
export default async function Settings() {
  await requireActor('admin');
  return (
    <>
      <PageHeading
        eyebrow="ВАША АКАДЕМИЯ"
        title="Настройки платформы"
        description="Брендинг, контакты и параметры учебной среды."
      />
      <SettingsForm initial={await getSettings()} />
    </>
  );
}
