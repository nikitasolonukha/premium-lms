import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { environment } from '@/lib/server/env';
export async function GET() {
  try {
    const env = environment();
    const db = createClient(env.supabaseUrl, env.publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (url, options) =>
          fetch(url, { ...options, signal: AbortSignal.timeout(2500), cache: 'no-store' }),
      },
    });
    const { error } = await db.rpc('branding');
    if (error) throw new Error();
    return NextResponse.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json(
      { status: 'unavailable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
