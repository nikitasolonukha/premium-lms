'use server';
import { z } from 'zod';
import { assertStaffAction } from '../server/auth';
import { userClient } from '../server/supabase';
import { privilegedClient } from '../server/privileged';
import { environment } from '../server/env';
import { userLimit } from '../server/limits';
import { actionResult, AppError, databaseError, rpcResult } from '../server/errors';
import type { CourseCard, PageData } from '../server/data';
export async function assignmentOptions(input: unknown) {
  return actionResult(async () => {
    await assertStaffAction(true);
    const parsed = z
      .object({
        userId: z.uuid(),
        q: z.string().max(200),
        page: z.number().int().min(1).max(10000),
      })
      .strict()
      .parse(input);
    const db = await userClient();
    const catalog = await db.rpc('catalog', { q: parsed.q, page: parsed.page, staff: true });
    databaseError(catalog.error);
    const list = rpcResult<PageData<CourseCard>>(catalog.data);
    if (!list.items.length) return { ...list, items: [] };
    const enrollments = await db
      .from('enrollments')
      .select('id,course_id')
      .eq('user_id', parsed.userId)
      .in(
        'course_id',
        list.items.map((c) => c.id),
      );
    databaseError(enrollments.error);
    const grants = enrollments.data?.length
      ? await db
          .from('access_grants')
          .select('enrollment_id,expires_at,source')
          .in(
            'enrollment_id',
            enrollments.data.map((e) => e.id),
          )
          .is('revoked_at', null)
          .eq('source', 'manual')
      : null;
    if (grants) databaseError(grants.error);
    const active = new Set(
      grants?.data
        ?.filter((g) => !g.expires_at || new Date(g.expires_at) > new Date())
        .map((g) => g.enrollment_id) ?? [],
    );
    return {
      ...list,
      items: list.items.map((c) => ({
        ...c,
        assigned: enrollments.data?.some((e) => e.course_id === c.id && active.has(e.id)) ?? false,
      })),
    };
  });
}
export async function inviteUser(input: unknown) {
  return actionResult(async () => {
    await assertStaffAction(true);
    await userLimit('admin');
    const parsed = z
      .object({
        email: z.email().max(254),
        first_name: z.string().trim().min(1).max(80),
        last_name: z.string().trim().max(80),
      })
      .strict()
      .safeParse(input);
    if (!parsed.success) throw new AppError('Проверьте email и имя.');
    const { error } = await privilegedClient().auth.admin.inviteUserByEmail(parsed.data.email, {
      data: { first_name: parsed.data.first_name, last_name: parsed.data.last_name },
      redirectTo: `${environment().appUrl}/auth/callback?next=/reset-password`,
    });
    if (error)
      throw new AppError(
        error.code === 'email_exists'
          ? 'Аккаунт с таким email уже существует.'
          : 'Не удалось отправить приглашение. Проверьте настройки почты.',
      );
    return { message: 'Приглашение отправлено. Пользователь получит роль Student.' };
  });
}
export async function courseFilterOptions(input: unknown) {
  return actionResult(async () => {
    await assertStaffAction(true);
    const { q, page } = z
      .object({ q: z.string().max(200), page: z.number().int().min(1).max(10000) })
      .strict()
      .parse(input);
    const result = await (
      await userClient()
    ).rpc('catalog', { q, page, staff: true, sort: 'title' });
    databaseError(result.error);
    return rpcResult<PageData<CourseCard>>(result.data);
  });
}
