export const metadata = { title: 'Новый пароль' };
import { AuthShell } from '@/components/auth-shell';
import { AuthForm } from '@/components/auth-form';
import { requireActor } from '@/lib/server/auth';
export default async function ResetPassword() {
  await requireActor();
  return (
    <AuthShell
      title="Новый пароль"
      description="Придумайте надёжный пароль, который вы не используете в других сервисах."
    >
      <AuthForm mode="reset" />
    </AuthShell>
  );
}
