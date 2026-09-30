'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { assertStaffAction, assertUserAction } from '../server/auth';
import { userClient } from '../server/supabase';
import { actionResult, AppError, databaseError, rpcResult } from '../server/errors';
import { courseSchema, settingsSchema, uuid, type CourseDraft } from '../schemas';
import type { Json } from '../database.types';
import { resolveVideo } from '../video';
import { protectedProviders } from '../protected-video';
import { runtimeEnvironment } from '../server/env';
import { getSettings } from '../server/data';

export async function saveCourse(input: unknown) {
  return actionResult(async () => {
    await assertStaffAction();
    const parsed = courseSchema.safeParse(input);
    if (!parsed.success) throw new AppError(parsed.error.issues[0].message);
    const settings = await getSettings();
    for (const m of parsed.data.modules)
      for (const l of m.lessons)
        for (const b of l.blocks)
          if (b.type === 'video') {
            try {
              if ('sourceId' in b.data) {
                if (!protectedProviders(runtimeEnvironment()).includes(b.data.provider))
                  throw new AppError('Защищённый видеопровайдер не настроен на сервере.');
              } else resolveVideo(b.data.provider, b.data.url, settings.embed_origins);
            } catch (error) {
              throw new AppError(error instanceof Error ? error.message : 'Проверьте видео');
            }
          }
    const db = await userClient();
    const { data, error } = await db.rpc('save_course', {
      doc: parsed.data as unknown as Json,
      expected_version: parsed.data.version,
    });
    databaseError(error);
    const result = rpcResult<{ id: string; version: number; revisionId: string }>(data);
    // All content queries are request-scoped. Revalidating a visited parent here
    // can remount a newly created editor while its save promise is resolving.
    // Navigation reads the current database snapshot without a shared cache.
    return result;
  });
}
export async function publishCourse(id: string, version: number) {
  return actionResult(async () => {
    await assertStaffAction(true);
    uuid.parse(id);
    const { data, error } = await (
      await userClient()
    ).rpc('publish_course', {
      cid: id,
      expected_version: z.number().int().positive().parse(version),
    });
    databaseError(error);
    rpcResult(data);
    revalidatePath('/courses');
    revalidatePath('/dashboard');
    revalidatePath('/admin/courses');
    return { message: 'Курс опубликован.' };
  });
}
export async function deleteCourse(id: string) {
  return actionResult(async () => {
    await assertStaffAction(true);
    uuid.parse(id);
    const result = await (await userClient()).rpc('delete_course', { cid: id });
    databaseError(result.error);
    rpcResult(result.data);
    revalidatePath('/admin/courses');
    return { message: 'Курс перемещён в архив.' };
  });
}
export async function duplicateCourse(id: string) {
  return actionResult(async () => {
    await assertStaffAction();
    uuid.parse(id);
    const db = await userClient();
    const result = await db.rpc('course_document', { cid: id, draft: true });
    databaseError(result.error);
    const doc = courseSchema.parse(result.data),
      newId = crypto.randomUUID();
    const copy: CourseDraft = {
      ...doc,
      id: newId,
      version: 0,
      slug: `${doc.slug.slice(0, 60)}-copy-${newId.slice(0, 8)}`,
      title: `${doc.title.slice(0, 170)} — копия`,
      accessMode: 'restricted',
      sequential: false,
      modules: doc.modules.map((m) => ({
        ...m,
        id: crypto.randomUUID(),
        lessons: m.lessons.map((l) => ({
          ...l,
          id: crypto.randomUUID(),
          blocks: l.blocks.map((b) => ({ ...b, id: crypto.randomUUID() })),
        })),
      })),
    };
    const saved = await db.rpc('save_course', {
      doc: copy as unknown as Json,
      expected_version: 0,
    });
    databaseError(saved.error);
    rpcResult(saved.data);
    revalidatePath('/admin/courses');
    return { id: newId };
  });
}
export async function setAccess(input: unknown) {
  return actionResult(async () => {
    await assertStaffAction(true);
    const parsed = z
      .object({ target_user: uuid, cid: uuid, enabled: z.boolean() })
      .strict()
      .parse(input);
    const result = await (await userClient()).rpc('set_access', parsed);
    databaseError(result.error);
    rpcResult(result.data);
    revalidatePath('/admin/users');
    return { message: parsed.enabled ? 'Доступ назначен.' : 'Доступ отозван.' };
  });
}
export async function setRole(input: unknown) {
  return actionResult(async () => {
    await assertStaffAction(true);
    const parsed = z
      .object({ target_user: uuid, new_role: z.enum(['student', 'editor', 'admin']) })
      .strict()
      .parse(input);
    const result = await (await userClient()).rpc('set_role', parsed);
    databaseError(result.error);
    rpcResult(result.data);
    revalidatePath('/admin/users');
    return { message: 'Роль изменена.' };
  });
}
export async function disableUser(input: unknown) {
  return actionResult(async () => {
    await assertStaffAction(true);
    const parsed = z.object({ target_user: uuid, disabled: z.boolean() }).strict().parse(input);
    const result = await (await userClient()).rpc('set_user_disabled', parsed);
    databaseError(result.error);
    rpcResult(result.data);
    revalidatePath('/admin/users');
    return { message: parsed.disabled ? 'Пользователь отключён.' : 'Пользователь включён.' };
  });
}
export async function recordProgress(id: string, complete = false, seconds = 0) {
  return actionResult(async () => {
    await assertUserAction();
    uuid.parse(id);
    const result = await (
      await userClient()
    ).rpc('record_progress', {
      lid: id,
      complete,
      seconds: z.number().int().min(0).max(86400).parse(seconds),
    });
    databaseError(result.error);
    rpcResult(result.data);
    revalidatePath('/dashboard');
    if (complete) revalidatePath('/courses');
    return { message: complete ? 'Урок завершён.' : 'Прогресс сохранён.' };
  });
}
export async function saveItem(id: string, lessonId: string | null, enabled: boolean) {
  return actionResult(async () => {
    await assertUserAction();
    uuid.parse(id);
    if (lessonId) uuid.parse(lessonId);
    const result = await (
      await userClient()
    ).rpc('save_item', { cid: id, lid: lessonId as unknown as string, enabled });
    databaseError(result.error);
    rpcResult(result.data);
    revalidatePath('/saved');
    return { message: enabled ? 'Добавлено в сохранённое.' : 'Удалено из сохранённого.' };
  });
}
export async function updateSettings(input: unknown) {
  return actionResult(async () => {
    await assertStaffAction(true);
    const parsed = settingsSchema.safeParse(input);
    if (!parsed.success) throw new AppError(parsed.error.issues[0].message);
    const result = await (
      await userClient()
    ).rpc('update_settings', { doc: parsed.data as unknown as Json });
    databaseError(result.error);
    rpcResult(result.data);
    revalidatePath('/', 'layout');
    return { message: 'Настройки сохранены.' };
  });
}
export async function mutateCategory(input: unknown) {
  return actionResult(async () => {
    await assertStaffAction(true);
    const parsed = z
      .object({
        cid: uuid,
        label: z.string().trim().min(1).max(80),
        color: z.enum(['blue', 'lime', 'lilac', 'peach']),
        remove: z.boolean(),
      })
      .strict()
      .parse(input);
    const result = await (await userClient()).rpc('mutate_category', parsed);
    databaseError(result.error);
    rpcResult(result.data);
    revalidatePath('/admin/categories');
    return { message: parsed.remove ? 'Категория удалена.' : 'Категория сохранена.' };
  });
}
export async function deleteMedia(id: string) {
  return actionResult(async () => {
    await assertStaffAction();
    uuid.parse(id);
    const result = await (await userClient()).rpc('delete_media', { mid: id });
    databaseError(result.error);
    rpcResult(result.data);
    revalidatePath('/admin/media');
    return { message: 'Файл удалён из медиатеки.' };
  });
}
