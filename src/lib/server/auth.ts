import 'server-only';
import { cache } from 'react';
import { redirect, forbidden } from 'next/navigation';
import { headers } from 'next/headers';
import { userClient } from './supabase';
import { environment } from './env';
import { AppError, databaseError } from './errors';
import type { Role } from '../domain';
import { safeNext } from '../domain';
export const getActor = cache(async () => {
  const db = await userClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return null;
  const [profile, role, claims] = await Promise.all([
    db.from('profiles').select('*').eq('id', user.id).single(),
    db.from('user_roles').select('role').eq('user_id', user.id).single(),
    db.auth.getClaims(),
  ]);
  if (!profile.data || !role.data || profile.data.disabled_at) return null;
  return {
    id: user.id,
    email: user.email ?? '',
    verified: !!user.email_confirmed_at,
    role: role.data.role as Role,
    profile: profile.data,
    aal: claims.data?.claims.aal as string | undefined,
  };
});
export async function requireActor(level: 'auth' | 'staff' | 'admin' = 'auth') {
  const actor = await getActor();
  if (!actor)
    redirect(
      '/login?next=' + encodeURIComponent(safeNext((await headers()).get('x-request-path'))),
    );
  if (!actor.verified) redirect('/login?reason=confirm');
  if (level !== 'auth') {
    if (actor.role === 'student' || (level === 'admin' && actor.role !== 'admin')) forbidden();
    if (actor.aal !== 'aal2') redirect('/mfa');
    const db = await userClient();
    const { error } = await db.rpc('touch_staff_session');
    if (error) redirect('/login?reason=session');
  }
  return actor;
}
export async function assertSameOrigin() {
  const h = await headers(),
    origin = h.get('origin');
  if (origin !== new URL(environment().appUrl).origin)
    throw new AppError('Запрос отклонён. Обновите страницу.', 403);
}
export async function assertStaffAction(adminOnly = false) {
  await assertSameOrigin();
  const actor = await requireActor(adminOnly ? 'admin' : 'staff');
  return actor;
}
export async function assertUserAction() {
  await assertSameOrigin();
  return requireActor();
}
export async function checkedRpc<T>(
  name: Parameters<Awaited<ReturnType<typeof userClient>>['rpc']>[0],
  args: never,
): Promise<T> {
  const db = await userClient();
  const { data, error } = await db.rpc(name, args);
  databaseError(error);
  return data as T;
}
