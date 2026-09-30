import { StudentHeader } from '@/components/navigation';
import { requireActor } from '@/lib/server/auth';
import { getBranding } from '@/lib/server/data';
export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const [actor, brand] = await Promise.all([requireActor(), getBranding()]);
  return (
    <>
      <StudentHeader
        brand={brand.brand_name}
        firstName={actor.profile.first_name}
        lastName={actor.profile.last_name}
        role={actor.role}
      />
      <main id="main-content" className="student-main">
        {children}
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
        <a href={`mailto:${brand.support_email}`}>Нужна помощь?</a>
      </footer>
    </>
  );
}
