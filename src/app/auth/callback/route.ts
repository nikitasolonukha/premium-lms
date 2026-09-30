import { NextResponse, type NextRequest } from 'next/server';
import { userClient } from '@/lib/server/supabase';
import { environment } from '@/lib/server/env';
import { safeNext } from '@/lib/domain';
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams,
    db = await userClient(),
    code = params.get('code'),
    tokenHash = params.get('token_hash'),
    type = params.get('type');
  let error: unknown = true;
  if (code) ({ error } = await db.auth.exchangeCodeForSession(code));
  else if (tokenHash && ['signup', 'recovery', 'email_change', 'invite'].includes(type ?? ''))
    ({ error } = await db.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as 'signup' | 'recovery' | 'email_change' | 'invite',
    }));
  const next =
    params.get('next') === '/reset-password' || type === 'recovery' || type === 'invite'
      ? '/reset-password'
      : safeNext(params.get('next'));
  return NextResponse.redirect(new URL(error ? '/login?reason=link' : next, environment().appUrl));
}
