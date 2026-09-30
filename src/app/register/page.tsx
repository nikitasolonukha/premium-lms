export const metadata = { title: 'Регистрация' };
import { AuthShell } from '@/components/auth-shell';
import { AuthForm } from '@/components/auth-form';
export default function Register() {
  return (
    <AuthShell
      title="Регистрация"
      description="Создайте аккаунт, чтобы получить доступ к своим программам."
    >
      <AuthForm mode="register" />
    </AuthShell>
  );
}
