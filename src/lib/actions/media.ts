'use server';
import { z } from 'zod';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { assertUserAction } from '../server/auth';
import { userClient } from '../server/supabase';
import { privilegedClient } from '../server/privileged';
import { actionResult, AppError, databaseError, rpcResult } from '../server/errors';
import { allowedFiles, validateFile, validateFilename } from '../files';
import { uuid } from '../schemas';

export async function createUpload(input: unknown) {
  return actionResult(async () => {
    const actor = await assertUserAction();
    const parsed = z
      .object({
        id: uuid,
        filename: z.string().min(1).max(240),
        mime: z.string().max(120),
        size: z.number().int().min(1).max(52428800),
        purpose: z.enum(['course', 'avatar', 'branding']),
      })
      .strict()
      .safeParse(input);
    if (!parsed.success) throw new AppError('Проверьте имя, тип и размер файла.');
    const { id, filename, mime, size, purpose } = parsed.data;
    if (purpose !== 'avatar' && actor.role === 'student')
      throw new AppError('Недостаточно прав.', 403);
    try {
      validateFilename(filename);
    } catch (e) {
      throw new AppError((e as Error).message);
    }
    if (!allowedFiles[mime]?.includes(filename.split('.').at(-1)?.toLowerCase() ?? ''))
      throw new AppError('Поддерживаются PDF, DOCX, XLSX, ZIP, JPG, PNG и WebP.');
    const db = await userClient();
    const result = await db.rpc('create_media', {
      mid: id,
      filename,
      mime_type: mime,
      size_bytes: size,
      purpose,
    });
    databaseError(result.error);
    const media = rpcResult<{ object_key: string }>(result.data);
    const upload = await privilegedClient()
      .storage.from('academy-private')
      .createSignedUploadUrl(media.object_key, { upsert: false });
    if (upload.error) throw new AppError('Не удалось подготовить загрузку.', 503);
    return { id, url: upload.data.signedUrl };
  });
}
export async function finalizeUpload(id: string) {
  return actionResult(async () => {
    const actor = await assertUserAction();
    uuid.parse(id);
    const db = await userClient();
    const row = await db.from('media').select('*').eq('id', id).eq('owner_id', actor.id).single();
    databaseError(row.error);
    const media = row.data;
    if (!media) throw new AppError('Загрузка не найдена.', 404);
    if (media.status === 'ready') return { id, filename: media.filename };
    if (media.status !== 'pending') throw new AppError('Загрузка недоступна.');
    const admin = privilegedClient(),
      download = await admin.storage.from('academy-private').download(media.object_key);
    if (download.error) throw new AppError('Файл ещё не загружен. Повторите попытку.');
    const bytes = Buffer.from(await download.data.arrayBuffer()),
      sha = createHash('sha256').update(bytes).digest('hex');
    let width: number | undefined, height: number | undefined;
    try {
      if (bytes.length !== media.size_bytes)
        throw new Error('Размер файла отличается от заявленного');
      validateFile(bytes, media.mime_type);
      if (media.mime_type.startsWith('image/')) {
        const input = sharp(bytes, { limitInputPixels: 40000000, failOn: 'warning' }),
          metadata = await input.metadata();
        if ((metadata.pages ?? 1) > 1) throw new Error('Используйте статичное изображение');
        const prepared = await input
          .rotate()
          .resize({ width: 1800, height: 1800, fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 86 })
          .toBuffer({ resolveWithObject: true });
        width = prepared.info.width;
        height = prepared.info.height;
        const stored = await admin.storage
          .from('academy-private')
          .upload(`${media.object_key}.webp`, prepared.data, {
            contentType: 'image/webp',
            upsert: false,
          });
        if (stored.error && !stored.error.message.toLowerCase().includes('already exists'))
          throw new Error('Не удалось подготовить изображение');
      }
    } catch (error) {
      await admin.rpc('finalize_media', { mid: id, owner: actor.id, sha, accepted: false });
      await admin.storage
        .from('academy-private')
        .remove([media.object_key, `${media.object_key}.webp`]);
      throw new AppError(error instanceof Error ? error.message : 'Проверка файла не пройдена.');
    }
    const finalized = await admin.rpc('finalize_media', {
      mid: id,
      owner: actor.id,
      sha,
      width,
      height,
      accepted: true,
    });
    databaseError(finalized.error);
    if (!finalized.data) {
      const current = await db.from('media').select('status').eq('id', id).single();
      databaseError(current.error);
      if (current.data?.status !== 'ready')
        throw new AppError('Загрузка уже отменена или отклонена. Загрузите файл повторно.', 409);
    }
    return { id, filename: media.filename };
  });
}
