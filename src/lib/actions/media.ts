'use server';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { assertUserAction, requireActor } from '../server/auth';
import { userClient } from '../server/supabase';
import { privilegedClient } from '../server/privileged';
import { actionResult, AppError, databaseError, rpcResult } from '../server/errors';
import { allowedFiles, validateFilename } from '../files';
import { uuid } from '../schemas';
import { inspectUpload } from '../upload-inspection';
import { prepareImageVariants, imageVariantKey, imageObjectKeys } from '../image-variants';
import { createMalwareScanner, ScannerUnavailable } from '../malware-scanner';
import { runtimeEnvironment } from '../server/env';
import { userLimit } from '../server/limits';

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
    if (media.purpose !== 'avatar')
      await requireActor(media.purpose === 'branding' ? 'admin' : 'staff');
    if (media.status === 'ready') return { id, filename: media.filename };
    if (media.status !== 'pending') throw new AppError('Загрузка недоступна.');
    await userLimit(media.purpose === 'avatar' ? 'learning' : 'admin');
    const sessionId = uuid.parse((await db.auth.getClaims()).data?.claims.session_id);
    const admin = privilegedClient(),
      download = await admin.storage.from('academy-private').download(media.object_key);
    if (download.error) throw new AppError('Файл ещё не загружен. Повторите попытку.');
    const bytes = Buffer.from(await download.data.arrayBuffer()),
      sha = createHash('sha256').update(bytes).digest('hex');
    let width: number | undefined, height: number | undefined;
    try {
      if (bytes.length !== media.size_bytes)
        throw new Error('Размер файла отличается от заявленного');
      await inspectUpload(bytes, media.mime_type, media.filename);
      const config = runtimeEnvironment();
      const scanner = createMalwareScanner(
        config.MALWARE_SCANNER === 'external'
          ? {
              mode: 'external',
              endpoint: config.MALWARE_SCANNER_URL!,
              token: config.MALWARE_SCANNER_TOKEN!,
            }
          : { mode: 'disabled' },
      );
      const scan = await scanner.scan(bytes);
      if (scan.status === 'infected')
        throw new Error('Сканер обнаружил небезопасное содержимое файла');
      if (media.mime_type.startsWith('image/')) {
        const variants = await prepareImageVariants(bytes);
        for (const variant of variants) {
          if (variant.size === 'large') {
            width = variant.width;
            height = variant.height;
          }
          const stored = await admin.storage
            .from('academy-private')
            .upload(imageVariantKey(media.object_key, variant.size, 1), variant.bytes, {
              contentType: 'image/webp',
              upsert: false,
            });
          if (stored.error && !stored.error.message.toLowerCase().includes('already exists'))
            throw new Error('Не удалось подготовить изображение');
        }
      }
    } catch (error) {
      // Scanner outages remain pending and can be retried. Do not pretend clean.
      if (error instanceof ScannerUnavailable)
        throw new AppError(
          'Проверка безопасности временно недоступна. Повторите загрузку позже.',
          503,
        );
      const rejected = await admin.rpc('finalize_media_v2', {
        mid: id,
        owner: actor.id,
        sha,
        session_id: sessionId,
        accepted: false,
      });
      // A concurrent successful finalize may already expose this file in a course.
      if (!rejected.error && rejected.data === true)
        await admin.storage.from('academy-private').remove(imageObjectKeys(media.object_key));
      throw new AppError(error instanceof Error ? error.message : 'Проверка файла не пройдена.');
    }
    const finalized = await admin.rpc('finalize_media_v2', {
      mid: id,
      owner: actor.id,
      sha,
      session_id: sessionId,
      width,
      height,
      accepted: true,
      variant_version: media.mime_type.startsWith('image/') ? 1 : 0,
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
