import { Logo } from './navigation';
import { ThemeToggle } from './providers';
import { ArrowUpRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { getBranding } from '@/lib/server/data';
export async function AuthShell({
  children,
  title,
  description,
}: {
  children: ReactNode;
  title: string;
  description: string;
}) {
  const brand = await getBranding();
  return (
    <main id="main-content" className="auth-shell">
      <section className="auth-story">
        <Logo brand={brand.brand_name} href="/" />
        <div className="auth-story-copy">
          <div className="eyebrow">УЧЕБНАЯ ПЛАТФОРМА</div>
          <h1>{brand.login_title}</h1>
          <p>{brand.login_description}</p>
        </div>
        <div className="auth-story-end">
          <div className="auth-story-footer">
            <span>{brand.footer_text}</span>
          </div>
        </div>
      </section>
      <section className="auth-panel">
        <div className="auth-panel-top">
          <span>{brand.brand_name}</span>
          <ThemeToggle />
        </div>
        <div className="auth-form-wrap">
          <span className="eyebrow">ЛИЧНЫЙ КАБИНЕТ</span>
          <h2>{title}</h2>
          <p className="auth-description">{description}</p>
          {children}
        </div>
        <div className="auth-panel-footer">
          <a href={`mailto:${brand.support_email}`}>
            Связаться с поддержкой <ArrowUpRight size={14} />
          </a>
          <span>© {new Date().getFullYear()}</span>
        </div>
      </section>
    </main>
  );
}
