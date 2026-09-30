import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '../database.types';
import { environment } from './env';
export async function userClient() {
  const jar = await cookies(),
    env = environment();
  return createServerClient<Database>(env.supabaseUrl, env.publishableKey, {
    cookieOptions: {
      httpOnly: true,
      secure: env.appUrl.startsWith('https://'),
      sameSite: 'lax',
      path: '/',
    },
    cookies: {
      getAll: () => jar.getAll(),
      setAll(values) {
        try {
          values.forEach(({ name, value, options }) =>
            jar.set(name, value, {
              ...options,
              httpOnly: true,
              secure: env.appUrl.startsWith('https://'),
              sameSite: 'lax',
              path: '/',
            }),
          );
        } catch {
          /* Proxy refreshes cookies before Server Components run. */
        }
      },
    },
  });
}
