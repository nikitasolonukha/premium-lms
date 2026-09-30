import type { MetadataRoute } from 'next';
import { environment } from '@/lib/server/env';
export const dynamic = 'force-dynamic';
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/dashboard',
        '/courses',
        '/library',
        '/saved',
        '/search',
        '/profile',
        '/admin',
        '/api',
        '/auth',
        '/login',
        '/register',
        '/forgot-password',
        '/reset-password',
        '/mfa',
      ],
    },
    sitemap: new URL('/sitemap.xml', environment().appUrl).toString(),
  };
}
