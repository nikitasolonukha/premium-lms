export const metadata = { title: 'Профиль' };
import Link from 'next/link';
import { LogOut, ShieldCheck, Mail, Settings } from 'lucide-react';
import { requireActor } from '@/lib/server/auth';
import { userClient } from '@/lib/server/supabase';
import { initials } from '@/lib/utils';
import { PageHeading, Badge } from '@/components/ui';
import { ProfileForm, PasswordForm } from '@/components/profile-form';
import { signOut } from '@/lib/actions/auth';
export default async function Profile() {
  const actor = await requireActor(),
    { data } = await (await userClient()).auth.mfa.listFactors(),
    enabled = data?.totp.some((f) => f.status === 'verified');
  return (
    <>
      <PageHeading
        eyebrow="ВАШ АККАУНТ"
        title="Мой профиль"
        description="Личные данные и настройки безопасности."
      />
      <div className="profile-layout">
        <div>
          <section className="panel">
            <div className="profile-header">
              {actor.profile.avatar_id ? (
                <img
                  className="avatar large"
                  src={`/api/media/${actor.profile.avatar_id}`}
                  alt="Фото профиля"
                />
              ) : (
                <span className="avatar large">
                  {initials(actor.profile.first_name, actor.profile.last_name)}
                </span>
              )}
              <div>
                <h2>
                  {actor.profile.first_name} {actor.profile.last_name}
                </h2>
                <p>{actor.email}</p>
              </div>
            </div>
            <ProfileForm
              firstName={actor.profile.first_name}
              lastName={actor.profile.last_name}
              avatarId={actor.profile.avatar_id}
            />
          </section>
          <section className="panel">
            <div className="panel-header">
              <h2>Изменить пароль</h2>
            </div>
            <PasswordForm />
          </section>
        </div>
        <aside className="panel">
          <div className="panel-header">
            <h2>Безопасность</h2>
            <ShieldCheck size={20} />
          </div>
          <div className="security-status">
            <Mail size={19} />
            <div>
              <strong>Email подтверждён</strong>
              <p>{actor.email}</p>
            </div>
          </div>
          <div className="security-status">
            <ShieldCheck size={19} />
            <div>
              <strong>Двухфакторная защита</strong>
              <p>{enabled ? 'Аутентификатор подключён.' : 'Добавьте ещё один уровень защиты.'}</p>
            </div>
          </div>
          <Link className="button button-secondary full-width" href="/mfa">
            {enabled ? 'Проверить аутентификатор' : 'Подключить MFA'}
          </Link>
          <div className="profile-role">
            <Badge>
              {actor.role === 'admin'
                ? 'Администратор'
                : actor.role === 'editor'
                  ? 'Редактор'
                  : 'Студент'}
            </Badge>
          </div>
          {actor.role !== 'student' && (
            <Link className="button button-secondary full-width" href="/admin">
              <Settings size={16} />
              Управление академией
            </Link>
          )}
          <form action={signOut}>
            <button type="submit" className="button button-ghost full-width">
              <LogOut size={16} />
              Выйти из аккаунта
            </button>
          </form>
        </aside>
      </div>
    </>
  );
}
