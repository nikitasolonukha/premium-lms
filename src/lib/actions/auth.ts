'use server';
import { z } from 'zod';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { userClient } from '../server/supabase';
import { assertSameOrigin, requireActor } from '../server/auth';
import { actionResult, AppError, databaseError } from '../server/errors';
import { authLimit, userLimit } from '../server/limits';
import { environment } from '../server/env';
import { credentialsSchema, passwordSchema } from '../schemas';
import { safeNext } from '../domain';

export async function signIn(input: unknown, next?: string) {
  return actionResult(async () => {
    await assertSameOrigin();
    const parsed = credentialsSchema.safeParse(input);
    if (!parsed.success) throw new AppError('Проверьте email и пароль.');
    await authLimit('login', parsed.data.email);
    const db = await userClient();
    const { data, error } = await db.auth.signInWithPassword(parsed.data);
    if (error)
      throw new AppError(
        error.code === 'email_not_confirmed'
          ? 'Подтвердите email по ссылке из письма.'
          : 'Неверный email или пароль.',
        401,
      );
    const role = await db.from('user_roles').select('role').eq('user_id', data.user.id).single();
    if (!role.data) {
      await db.auth.signOut({ scope: 'local' });
      throw new AppError('Аккаунт недоступен. Обратитесь к администратору.', 403);
    }
    return { redirect: role.data?.role !== 'student' ? '/mfa' : safeNext(next) };
  });
}
export async function register(input: unknown) {
  return actionResult(async () => {
    await assertSameOrigin();
    const parsed = credentialsSchema
      .extend({
        password: passwordSchema,
        first_name: z.string().trim().min(1).max(80),
        last_name: z.string().trim().max(80),
      })
      .safeParse(input);
    if (!parsed.success) throw new AppError(parsed.error.issues[0].message);
    await authLimit('register', parsed.data.email);
    const db = await userClient();
    const { error } = await db.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        data: { first_name: parsed.data.first_name, last_name: parsed.data.last_name },
        emailRedirectTo: `${environment().appUrl}/auth/callback`,
      },
    });
    if (error)
      throw new AppError('Не удалось зарегистрироваться. Проверьте данные и попробуйте позже.');
    return { message: 'Проверьте почту — мы отправили ссылку для подтверждения email.' };
  });
}
export async function requestPasswordReset(input: unknown) {
  return actionResult(async () => {
    await assertSameOrigin();
    const email = z.email().max(254).safeParse(input);
    if (!email.success) throw new AppError('Введите корректный email.');
    await authLimit('reset', email.data);
    const db = await userClient();
    const { error } = await db.auth.resetPasswordForEmail(email.data, {
      redirectTo: `${environment().appUrl}/auth/callback?next=/reset-password`,
    });
    if (error && error.status && error.status >= 500)
      throw new AppError('Почтовый сервис временно недоступен.', 503);
    return { message: 'Если аккаунт с таким email существует, письмо со ссылкой уже отправлено.' };
  });
}
export async function changePassword(input: unknown) {
  return actionResult(async () => {
    await assertSameOrigin();
    await requireActor();
    const parsed = passwordSchema.safeParse(input);
    if (!parsed.success) throw new AppError(parsed.error.issues[0].message);
    await userLimit('learning');
    const db = await userClient();
    const { error } = await db.auth.updateUser({ password: parsed.data });
    if (error)
      throw new AppError(
        'Не удалось изменить пароль. Войдите заново или запросите новую ссылку восстановления.',
      );
    await db.auth.signOut({ scope: 'others' });
    return { message: 'Пароль изменён. Другие сессии завершены.' };
  });
}
export async function signOut() {
  await assertSameOrigin();
  const db = await userClient();
  await db.auth.signOut({ scope: 'local' });
  const jar = await cookies();
  jar.delete('academy-recovery');
  redirect('/login');
}
export async function enrollMfa() {
  return actionResult(async () => {
    await assertSameOrigin();
    await requireActor();
    await userLimit('learning');
    const db = await userClient();
    const factors = await db.auth.mfa.listFactors();
    if (factors.error) throw new AppError('Не удалось получить настройки безопасности.');
    if (factors.data.totp.some((f) => f.status === 'verified'))
      throw new AppError('Аутентификатор уже подключён. Используйте его для входа.');
    for (const factor of factors.data.all.filter((f) => f.status === 'unverified'))
      await db.auth.mfa.unenroll({ factorId: factor.id });
    const { data, error } = await db.auth.mfa.enroll({
      factorType: 'totp',
      issuer: 'Academy LMS',
      friendlyName: 'Основной аутентификатор',
    });
    if (error) throw new AppError('Не удалось настроить аутентификатор. Повторите попытку.');
    return { id: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
  });
}
export async function verifyMfa(input: unknown) {
  return actionResult(async () => {
    await assertSameOrigin();
    const actor = await requireActor();
    await userLimit('learning');
    const parsed = z
      .object({ factorId: z.uuid(), code: z.string().regex(/^\d{6}$/) })
      .strict()
      .safeParse(input);
    if (!parsed.success) throw new AppError('Введите шестизначный код.');
    const db = await userClient();
    const { error } = await db.auth.mfa.challengeAndVerify(parsed.data);
    if (error) throw new AppError('Код неверен или истёк. Попробуйте новый код.', 401);
    if (actor.role !== 'student') {
      const result = await db.rpc('touch_staff_session');
      databaseError(result.error);
    }
    return { redirect: actor.role === 'student' ? '/profile' : '/admin' };
  });
}
export async function updateProfile(input: unknown) {
  return actionResult(async () => {
    await assertSameOrigin();
    await requireActor();
    const parsed = z
      .object({
        first_name: z.string().trim().min(1).max(80),
        last_name: z.string().trim().max(80),
        avatar_id: z.uuid().nullable(),
      })
      .strict()
      .safeParse(input);
    if (!parsed.success) throw new AppError('Проверьте данные профиля.');
    const result = await (
      await userClient()
    ).rpc('update_profile', { ...parsed.data, avatar_id: parsed.data.avatar_id ?? undefined });
    databaseError(result.error);
    return { message: 'Профиль обновлён.' };
  });
}
