import { AdminSidebar, MobileNav } from '@/components/navigation';
import { ThemeToggle } from '@/components/providers';
import { requireActor } from '@/lib/server/auth';
import { getBranding } from '@/lib/server/data';
import { initials } from '@/lib/utils';
import Link from 'next/link';
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [actor, brand] = await Promise.all([requireActor('staff'), getBranding()]);
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
          {children}
        </main>
      </div>
    </div>
  );
}
