import { AdminSidebar, MobileNav } from '@/components/navigation';
import { ThemeToggle } from '@/components/providers';
import { requireActor } from '@/lib/server/auth';
import { getBranding } from '@/lib/server/data';
import { initials } from '@/lib/utils';
import Link from 'next/link';
import { StaffSessionWarning } from '@/components/staff-session-warning';
import { userClient } from '@/lib/server/supabase';
import { staffSessionSchema } from '@/lib/staff-session';
import { databaseError } from '@/lib/server/errors';
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [actor, brand] = await Promise.all([requireActor('staff'), getBranding()]);
  const session = await (await userClient()).rpc('staff_session_status');
  databaseError(session.error);
  return (
    <div className="admin-shell">
      <AdminSidebar brand={brand.brand_name} role={actor.role} />
      <div className="admin-workspace">
        <header className="admin-topbar">
          <div>
            <MobileNav admin brand={brand.brand_name} role={actor.role} />
            <span className="admin-context">
              Рабочее пространство <span>/</span>{' '}
              {actor.role === 'admin' ? 'Администратор' : 'Редактор'}
            </span>
          </div>
          <div className="header-actions">
            <ThemeToggle />
            <Link className="avatar" href="/profile" aria-label="Мой профиль">
              {initials(actor.profile.first_name, actor.profile.last_name)}
            </Link>
          </div>
        </header>
        <main id="main-content" className="admin-main">
          <StaffSessionWarning initial={staffSessionSchema.parse(session.data)} />
          {children}
        </main>
      </div>
    </div>
  );
}
