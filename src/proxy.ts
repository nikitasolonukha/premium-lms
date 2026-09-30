import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import type { Database } from './lib/database.types';
import { requestId } from './lib/request-security';
import { environment } from './lib/server/env';

export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64'),
    development = process.env.NODE_ENV !== 'production';
  const requestHeaders = new Headers(request.headers);
  const correlation = requestId(request.headers.get('x-request-id'));
  requestHeaders.set('x-request-id', correlation);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('x-request-path', request.nextUrl.pathname + request.nextUrl.search);
  const env = environment();
  const supabaseOrigin = new URL(env.supabaseUrl).origin;
  const frameOrigins = [
    'https://www.youtube-nocookie.com',
    'https://player.vimeo.com',
    'https://rutube.ru',
  ];
  let response = NextResponse.next({ request: { headers: requestHeaders } });
  const secure = env.appUrl.startsWith('https://');
  const db = createServerClient<Database>(env.supabaseUrl, env.publishableKey, {
    cookieOptions: { httpOnly: true, secure, sameSite: 'lax', path: '/' },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values) {
        values.forEach(({ name, value }) => request.cookies.set(name, value));
        requestHeaders.set('cookie', request.cookies.toString());
        response = NextResponse.next({ request: { headers: requestHeaders } });
        values.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, {
            ...options,
            httpOnly: true,
            secure,
            sameSite: 'lax',
            path: '/',
          }),
        );
      },
    },
  });
  const { data } = await db.auth.getClaims();
  if (data?.claims) {
    const settings = await db.rpc('runtime_settings');
    const config = settings.data as { embed_origins?: string[] } | null;
    for (const value of config?.embed_origins ?? []) {
      try {
        const u = new URL(value);
        if (u.protocol === 'https:') frameOrigins.push(u.origin);
      } catch {}
    }
  }
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${supabaseOrigin}`,
    "font-src 'self'",
    `connect-src 'self' ${supabaseOrigin}${development ? ' ws://localhost:3000' : ''}`,
    `frame-src ${frameOrigins.join(' ')}`,
    "media-src 'self' https:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
  requestHeaders.set('Content-Security-Policy', csp);
  // Preserve the final refreshed cookie set while adding nonce headers for RSC.
  const final = NextResponse.next({ request: { headers: requestHeaders } });
  response.cookies.getAll().forEach((c) => final.cookies.set(c));
  final.headers.set('Content-Security-Policy', csp);
  final.headers.set('x-request-id', correlation);
  final.headers.set('Cache-Control', 'private, no-store, max-age=0');
  final.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  final.headers.set('X-Content-Type-Options', 'nosniff');
  final.headers.set('X-Frame-Options', 'DENY');
  final.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  if (secure) final.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  return final;
}
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:woff2|svg|png|jpg|webp)$).*)'],
};
