import 'server-only';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { environment } from './env';
import { reportError } from './monitoring';

export async function readiness() {
  try {
    const env = environment();
    const db = createClient(env.supabaseUrl, env.publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(2500), cache: 'no-store' }) },
    });
    const { error } = await db.rpc('branding');
    if (error) throw new Error('Dependency unavailable');
    return NextResponse.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    await reportError('readiness.failed', error);
    return NextResponse.json({ status: 'unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
