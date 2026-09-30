export const metadata = { title: 'Проверка безопасности' };
import { requireActor } from '@/lib/server/auth';
import { userClient } from '@/lib/server/supabase';
import { AuthShell } from '@/components/auth-shell';
import { MfaForm } from '@/components/mfa-form';
export default async function Mfa() {
  await requireActor();
  const { data } = await (await userClient()).auth.mfa.listFactors();
  const factor = data?.totp.find((f) => f.status === 'verified');
  return (
    <AuthShell
      title={factor ? 'Подтвердите, что это вы' : 'Защитите свой аккаунт'}
      description={
        factor
          ? 'Введите код из приложения-аутентификатора для безопасного входа.'
          : 'Для работы с контентом и управления академией нужна двухфакторная защита.'
      }
    >
      <MfaForm factorId={factor?.id} />
    </AuthShell>
  );
}
