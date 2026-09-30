export const metadata = { title: 'Вход' };
import { AuthShell } from '@/components/auth-shell';
import { AuthForm } from '@/components/auth-form';
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reason?: string }>;
}) {
  const params = await searchParams;
  const notices: Record<string, string> = {
    session: 'Сессия администратора истекла. Войдите заново.',
    confirm: 'Подтвердите email по ссылке из письма.',
    link: 'Ссылка недействительна или уже использована. Запросите новую.',
  };
  return (
    <AuthShell title="С возвращением" description="Ваш следующий шаг начинается здесь.">
      <AuthForm
        mode="login"
        next={params.next}
        notice={params.reason ? notices[params.reason] : undefined}
      />
    </AuthShell>
  );
}
