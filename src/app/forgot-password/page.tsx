export const metadata = { title: 'Восстановление доступа' };
import { AuthShell } from '@/components/auth-shell';
import { AuthForm } from '@/components/auth-form';
export default function ForgotPassword() {
  return (
    <AuthShell
      title="Восстановить доступ"
      description="Укажите email аккаунта. Мы отправим ссылку для создания нового пароля."
    >
      <AuthForm mode="forgot" />
    </AuthShell>
  );
}
