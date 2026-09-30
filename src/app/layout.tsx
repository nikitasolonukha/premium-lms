import type { Metadata } from 'next';
import { headers } from 'next/headers';
import '@fontsource-variable/manrope';
import './globals.css';
import { Providers } from '@/components/providers';
import { getBranding } from '@/lib/server/data';
import type { CSSProperties } from 'react';
import { environment } from '@/lib/server/env';
export async function generateMetadata(): Promise<Metadata> {
  const settings = await getBranding();
  return {
    metadataBase: new URL(environment().appUrl),
    title: { default: settings.brand_name, template: `%s · ${settings.brand_name}` },
    description: settings.seo_description,
    icons: { icon: '/api/brand/favicon' },
    robots: { index: false, follow: false },
    openGraph: {
      title: settings.brand_name,
      description: settings.seo_description,
      type: 'website',
      locale: 'ru_RU',
    },
  };
}
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get('x-nonce') ?? undefined,
    brand = await getBranding();
  return (
    <html lang="ru" data-scroll-behavior="smooth" suppressHydrationWarning>
      <body
        className={`brand-root ${brand.logo_asset_id ? 'custom-brand' : ''}`}
        style={{ '--brand-accent': brand.accent_color } as CSSProperties}
      >
        <Providers nonce={nonce}>
          <a href="#main-content" className="skip-link">
            К основному содержимому
          </a>
          {children}
        </Providers>
      </body>
    </html>
  );
}
