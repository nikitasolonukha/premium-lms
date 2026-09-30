import { requireActor } from '@/lib/server/auth';
import { operations, workerStatus } from '@/lib/server/operations';
import { runtimeEnvironment } from '@/lib/server/env';
import type { AutomationRule, Connection, OperationJob } from '@/lib/operations';
import { PageHeading, Badge } from '@/components/ui';
import { AutomationsManager, Jobs, RefreshOperations } from '@/components/admin-operations';
export const metadata = { title: 'Автоматизации' };
export default async function Automations() {
  await requireActor('admin');
  const [rules, connections, jobs, worker] = await Promise.all([
    operations<AutomationRule[]>('rules'),
    operations<Connection[]>('connections'),
    operations<OperationJob[]>('list'),
    workerStatus(),
  ]);
  const online = worker.online;
  return (
    <>
      <PageHeading
        title="Автоматизации"
        description="Расписание отчётов, Telegram и результаты фоновых операций."
        action={
          <RefreshOperations active={jobs.some((j) => ['queued', 'running'].includes(j.status))} />
        }
      />
      <p>
        <Badge tone={online ? 'blue' : 'danger'}>
          {online ? 'Обработчик работает' : 'Обработчик не отвечает'}
        </Badge>
      </p>
      <AutomationsManager
        rules={rules}
        connections={connections}
        configured={!!runtimeEnvironment().TELEGRAM_BOT_TOKEN}
        botUsername={worker.capabilities?.bot_username}
      />
      <h2>Последние 100 заданий</h2>
      <Jobs jobs={jobs} />
    </>
  );
}
