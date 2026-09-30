'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { assertStaffAction } from '../server/auth';
import { operations } from '../server/operations';
import { actionResult, AppError } from '../server/errors';
import { parseCsv, rowsFromTable, ruleSchema, type PreviewRow, type VideoJob } from '../operations';
import { inspectUpload } from '../upload-inspection';
import { privilegedClient } from '../server/privileged';
import { runtimeEnvironment } from '../server/env';
export async function previewImport(form: FormData) {
  return actionResult(async () => {
    await assertStaffAction(true);
    const file = form.get('file');
    if (!(file instanceof File) || file.size < 1 || file.size > 1500000)
      throw new AppError('Выберите CSV или XLSX до 1,5 МБ, не более 500 строк.');
    const bytes = Buffer.from(await file.arrayBuffer());
    let table: string[][];
    if (/\.csv$/i.test(file.name)) {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      table = parseCsv(text);
    } else if (/\.xlsx$/i.test(file.name)) {
      await inspectUpload(
        bytes,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        file.name,
      );
      const ExcelJS = await import('exceljs');
      const workbook = new ExcelJS.default.Workbook();
      await workbook.xlsx.load(bytes as never);
      const sheet = workbook.worksheets[0];
      if (
        !sheet ||
        workbook.worksheets.length !== 1 ||
        sheet.rowCount > 501 ||
        sheet.columnCount > 20
      )
        throw new AppError('Один лист, до 500 учеников и 20 колонок.');
      table = [];
      sheet.eachRow((row) => {
        const cells: string[] = [];
        for (let n = 1; n <= sheet.columnCount; n++) {
          const value = row.getCell(n).value;
          if (value !== null && typeof value !== 'string' && typeof value !== 'number')
            throw new AppError(
              'Используйте обычный текст: формулы, ссылки и объекты в ячейках не поддерживаются.',
            );
          cells.push(String(value ?? ''));
        }
        if (cells.some((v) => v.trim())) table.push(cells);
      });
    } else throw new AppError('Поддерживаются CSV UTF-8 и XLSX.');
    return operations<{ id: string; rows: PreviewRow[] }>('import.preview', {
      rows: rowsFromTable(table),
      filename: file.name,
    });
  });
}
export async function confirmImport(input: unknown) {
  return actionResult(async () => {
    await assertStaffAction(true);
    const p = z.object({ id: z.uuid(), courseId: z.uuid().optional() }).strict().parse(input);
    return operations<{ id: string }>('import.confirm', p);
  });
}
export async function bulkAccess(input: unknown) {
  return actionResult(async () => {
    await assertStaffAction(true);
    const p = z
      .object({
        requestId: z.uuid(),
        courseId: z.uuid(),
        userIds: z.array(z.uuid()).min(1).max(500),
        enabled: z.boolean(),
      })
      .strict()
      .parse(input);
    const result = await operations<{ count: number }>('bulk', p);
    revalidatePath('/admin/users');
    return result;
  });
}
export async function saveRule(input: unknown) {
  return actionResult(async () => {
    await assertStaffAction(true);
    const result = await operations('rule.save', ruleSchema.parse(input));
    revalidatePath('/admin/automations');
    return result;
  });
}
export async function operationCommand(input: unknown) {
  return actionResult(async () => {
    const p = z
      .object({
        op: z.enum(['rule.toggle', 'rule.run', 'job.retry', 'telegram.disconnect', 'video.retry']),
        id: z.uuid().optional(),
        enabled: z.boolean().optional(),
      })
      .strict()
      .parse(input);
    await assertStaffAction(p.op !== 'video.retry');
    if (p.op !== 'telegram.disconnect' && !p.id) throw new AppError('Выберите запись.');
    const result = await operations(p.op, { id: p.id, enabled: p.enabled });
    revalidatePath('/admin/automations');
    revalidatePath('/admin/videos');
    return result;
  });
}
export async function telegramLink() {
  return actionResult(async () => {
    await assertStaffAction(true);
    if (!runtimeEnvironment().TELEGRAM_BOT_TOKEN)
      throw new AppError('Сначала настройте TELEGRAM_BOT_TOKEN на сервере.');
    return operations<{ token: string; expires_at: string }>('telegram.link');
  });
}
export async function videoList(q = '') {
  return actionResult(async () => {
    await assertStaffAction();
    return operations<VideoJob[]>('video.list', { q: z.string().max(100).parse(q) });
  });
}
export async function createVideo(input: unknown) {
  return actionResult(async () => {
    await assertStaffAction();
    const p = z
      .object({
        id: z.uuid(),
        filename: z
          .string()
          .min(1)
          .max(240)
          .refine((v) => /\.mp4$/i.test(v) && !/[\x00-\x1f/\\]/.test(v)),
        size: z.number().int().min(1).max(1073741824),
        watermark: z.string().trim().min(1).max(120),
        download: z.boolean(),
      })
      .strict()
      .parse(input);
    const row = await operations<{ id: string; media_id: string; original_key: string }>(
      'video.create',
      p,
    );
    const signed = await privilegedClient()
      .storage.from('academy-video-source')
      .createSignedUploadUrl(row.original_key, { upsert: false });
    if (signed.error) throw new AppError('Не удалось подготовить загрузку.');
    return { id: row.id, media_id: row.media_id, url: signed.data.signedUrl };
  });
}
export async function queueVideo(id: string) {
  return actionResult(async () => {
    await assertStaffAction();
    return operations('video.enqueue', { id: z.uuid().parse(id) });
  });
}
