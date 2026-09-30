import Link from 'next/link';
import { ArrowRight, ArrowUpRight, BookOpen, Compass, Sparkles } from 'lucide-react';
import { Logo } from '@/components/navigation';
import { ThemeToggle } from '@/components/providers';
import { getBranding } from '@/lib/server/data';
import type { Metadata } from 'next';
export const metadata: Metadata = {
  robots: { index: true, follow: true },
  alternates: { canonical: '/' },
};
export default async function Landing() {
  const brand = await getBranding();
  return (
    <div className="landing">
      <header className="landing-header">
        <Logo href="/" brand={brand.brand_name} />
        <div className="header-actions">
          <ThemeToggle />
          <Link className="button button-secondary" href="/login">
            Войти <ArrowUpRight size={16} />
          </Link>
        </div>
      </header>
      <main id="main-content" className="landing-main">
        <div className="landing-copy">
          <div className="eyebrow">
            <span className="status-dot" /> ВАША СРЕДА РАЗВИТИЯ
          </div>
          <h1>{brand.login_title}</h1>
          <p>{brand.login_description}</p>
          <div className="landing-cta">
            <Link className="button button-primary button-large" href="/login">
              Продолжить обучение <ArrowRight size={20} />
            </Link>
            <Link href="/register" className="text-link">
              Создать аккаунт
            </Link>
          </div>
          <div className="landing-benefits">
            <span>
              <BookOpen size={19} /> Знания с практикой
            </span>
            <span>
              <Compass size={19} /> В своём темпе
            </span>
            <span>
              <Sparkles size={19} /> С фокусом на результат
            </span>
          </div>
        </div>
        <div className="landing-art" aria-hidden="true">
          <span className="art-label">
            НОВЫЙ ВЗГЛЯД
            <br />
            НОВЫЕ ВОЗМОЖНОСТИ
          </span>
          <div className="orb-scene">
            <div className="orb-ring ring-one" />
            <div className="orb-sphere" />
            <div className="orb-ring ring-two" />
          </div>
          <span className="art-caption">
            LEARN. MAKE. CHANGE. <ArrowUpRight size={25} />
          </span>
        </div>
      </main>
      <footer className="student-footer">
        <span>
          © {new Date().getFullYear()} {brand.brand_name}
        </span>
        <span>{brand.footer_text}</span>
        {brand.social_links.map((link) => (
          <a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer">
            {link.label}
          </a>
        ))}
        <a href={`mailto:${brand.support_email}`}>Поддержка</a>
      </footer>
    </div>
  );
}
