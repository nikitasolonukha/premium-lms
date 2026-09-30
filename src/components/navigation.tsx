'use client';
import Link from 'next/link';
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import * as Dialog from '@radix-ui/react-dialog';
import {
  ArrowUpRight,
  BookOpen,
  Bookmark,
  ChevronRight,
  GraduationCap,
  LayoutDashboard,
  Library,
  LogOut,
  Menu,
  Search,
  Settings,
  Shield,
  Users,
  X,
  Folder,
  ChartNoAxesCombined,
  Image as ImageIcon,
} from 'lucide-react';
import { signOut } from '@/lib/actions/auth';
import { ThemeToggle } from './providers';
import { cn, initials } from '@/lib/utils';
const studentLinks = [
  { href: '/dashboard', label: 'Главная', icon: LayoutDashboard },
  { href: '/courses', label: 'Программы', icon: BookOpen },
  { href: '/library', label: 'Материалы', icon: Library },
  { href: '/saved', label: 'Сохранённое', icon: Bookmark },
];
const adminLinks = [
  { href: '/admin', label: 'Обзор', icon: LayoutDashboard },
  { href: '/admin/courses', label: 'Курсы', icon: BookOpen },
  { href: '/admin/users', label: 'Пользователи', icon: Users, admin: true },
  { href: '/admin/categories', label: 'Категории', icon: Folder, admin: true },
  { href: '/admin/media', label: 'Медиатека', icon: ImageIcon },
  { href: '/admin/analytics', label: 'Аналитика', icon: ChartNoAxesCombined, admin: true },
  { href: '/admin/settings', label: 'Настройки', icon: Settings, admin: true },
  { href: '/admin/audit', label: 'Журнал действий', icon: Shield, admin: true },
];
export function Logo({
  brand = 'Академия',
  href = '/dashboard',
}: {
  brand?: string;
  href?: string;
}) {
  return (
    <Link className="logo" href={href}>
      <span className="logo-symbol">
        <GraduationCap size={22} />
      </span>
      <span>
        {brand}
        <small>СРЕДА РАЗВИТИЯ</small>
      </span>
    </Link>
  );
}
function NavLinks({
  admin = false,
  role = 'student',
  onSelect,
}: {
  admin?: boolean;
  role?: string;
  onSelect?: () => void;
}) {
  const path = usePathname();
  return (
    <>
      {(admin ? adminLinks : studentLinks)
        .filter((item) => !('admin' in item) || !item.admin || role === 'admin')
        .map((item) => {
          const active =
            path === item.href ||
            (item.href !== '/admin' &&
              item.href !== '/dashboard' &&
              path.startsWith(`${item.href}/`));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn('nav-link', active && 'active')}
              aria-current={active ? 'page' : undefined}
              onClick={onSelect}
            >
              <item.icon size={19} />
              <span>{item.label}</span>
              {admin && active && <ChevronRight size={14} className="nav-chevron" />}
            </Link>
          );
        })}
    </>
  );
}
export function StudentHeader({
  brand,
  firstName,
  lastName,
  role,
}: {
  brand: string;
  firstName: string;
  lastName: string;
  role: string;
}) {
  return (
    <header className="student-header">
      <div className="header-inner">
        <Logo brand={brand} />
        <nav className="desktop-nav" aria-label="Основная навигация">
          <NavLinks />
        </nav>
        <div className="header-actions">
          <Link href="/search" className="icon-button" aria-label="Поиск">
            <Search size={20} />
          </Link>
          <ThemeToggle />
          <Link className="avatar" href="/profile" aria-label="Мой профиль">
            {initials(firstName, lastName)}
          </Link>
          <MobileNav brand={brand} role={role} />
        </div>
      </div>
    </header>
  );
}
export function AdminSidebar({ brand, role }: { brand: string; role: string }) {
  return (
    <aside className="admin-sidebar">
      <Logo brand={brand} href="/admin" />
      <span className="sidebar-caption">УПРАВЛЕНИЕ АКАДЕМИЕЙ</span>
      <nav aria-label="Административная навигация">
        <NavLinks admin role={role} />
      </nav>
      <div className="sidebar-bottom">
        <Link className="nav-link" href="/dashboard">
          <ArrowUpRight size={19} />
          Открыть академию
        </Link>
        <form action={signOut}>
          <button className="nav-link" type="submit">
            <LogOut size={18} />
            Выйти
          </button>
        </form>
        <div className="sidebar-security">
          <Shield size={15} /> Сессия защищена MFA
        </div>
      </div>
    </aside>
  );
}
export function MobileNav({
  brand,
  role,
  admin = false,
}: {
  brand: string;
  role: string;
  admin?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button className="icon-button mobile-menu" aria-label="Открыть меню">
          <Menu size={22} />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="drawer nav-drawer">
          <div className="drawer-top">
            <Dialog.Title>{brand}</Dialog.Title>
            <Dialog.Close className="icon-button" aria-label="Закрыть меню">
              <X size={20} />
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">Навигация по академии</Dialog.Description>
          <nav>
            <NavLinks admin={admin} role={role} onSelect={() => setOpen(false)} />
          </nav>
          {role !== 'student' && !admin && (
            <Link className="nav-link" href="/admin" onClick={() => setOpen(false)}>
              <Shield size={19} />
              Управление
            </Link>
          )}
          <Link className="nav-link" href="/profile" onClick={() => setOpen(false)}>
            <Users size={19} />
            Мой профиль
          </Link>
          <form action={signOut}>
            <button type="submit" className="nav-link">
              <LogOut size={19} />
              Выйти
            </button>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
