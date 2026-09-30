export const metadata = { title: 'Настройки' };
import { requireActor } from '@/lib/server/auth';
import { getSettings } from '@/lib/server/data';
import { PageHeading } from '@/components/ui';
import { SettingsForm } from '@/components/settings-form';
import { ProviderHealth } from '@/components/provider-health';
import { protectedProviders } from '@/lib/protected-video';
import { runtimeEnvironment } from '@/lib/server/env';
import { observeProviderConfiguration } from '@/lib/server/provider-audit';
export default async function Settings() {
  await requireActor('admin');
  await observeProviderConfiguration();
  return (
    <>
      <PageHeading
        eyebrow="ВАША АКАДЕМИЯ"
        title="Настройки платформы"
        description="Брендинг, контакты и параметры учебной среды."
      />
      <SettingsForm initial={await getSettings()} />
      <ProviderHealth configured={protectedProviders(runtimeEnvironment())} />
    </>
  );
}
