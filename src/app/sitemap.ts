import type { MetadataRoute } from 'next';
import { environment } from '@/lib/server/env';
export const dynamic = 'force-dynamic';
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: new URL('/', environment().appUrl).toString(), changeFrequency: 'monthly', priority: 1 },
  ];
}
