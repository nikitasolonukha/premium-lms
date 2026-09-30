import { z } from 'zod';
export const importRow = z
  .object({
    email: z
      .email()
      .max(254)
      .transform((v) => v.trim().toLowerCase()),
    first_name: z.string().trim().min(1).max(80),
    last_name: z.string().trim().max(80).default(''),
  })
  .strict();
export type ImportRow = z.infer<typeof importRow>;
export type PreviewRow = ImportRow & {
  number: number;
  existing_id: string | null;
  issues: string[];
};
export type OperationJob = {
  id: string;
  kind: string;
  status: string;
  progress: number;
  attempts: number;
  result: Record<string, unknown>;
  error_code: string | null;
  created_at: string;
  updated_at: string;
  title: string;
};
export type VideoJob = OperationJob & {
  filename: string;
  media_id: string;
  poster_id: string;
  download: boolean;
};
export type Connection = {
  id: string;
  owner_id: string;
  name: string;
  enabled: boolean;
  created_at: string;
};
export const ruleSchema = z
  .object({
    id: z.uuid().optional(),
    name: z.string().trim().min(1).max(100),
    kind: z.enum(['summary', 'inactive', 'completions']),
    enabled: z.boolean(),
    frequency: z.enum(['daily', 'weekly']),
    hour: z.number().int().min(0).max(23),
    minute: z.number().int().min(0).max(59),
    weekday: z.number().int().min(0).max(6),
    timezone: z.string().min(1).max(100),
    recipients: z.array(z.uuid()).min(1).max(20),
  })
  .strict();
export type AutomationRule = z.infer<typeof ruleSchema> & { id: string; next_run_at: string };
export type StudentCard = {
  profile: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    role: string;
    disabled_at: string | null;
    created_at: string;
    last_sign_in_at: string | null;
  };
  courses: {
    id: string;
    slug: string;
    title: string;
    access_mode: string;
    access: boolean;
    lessons: number;
    completed: number;
    last_activity: string | null;
    last_lesson: {
      id: string;
      title: string;
      opened_at: string;
      completed_at: string | null;
    } | null;
    grants: {
      source: string;
      created_at: string;
      expires_at: string | null;
      revoked_at: string | null;
    }[];
  }[];
  total: number;
  history: {
    id: number;
    action: string;
    entity_type: string;
    entity_id: string;
    created_at: string;
    metadata: Record<string, unknown>;
  }[];
};
export const operationErrors: Record<string, string> = {
  NOT_CONFIGURED: 'Сервис не подключён',
  DELIVERY_UNKNOWN: 'Доставка не подтверждена. Повтор может отправить сообщение ещё раз.',
  DELIVERY_FAILED: 'Не удалось доставить отчёт',
  IMPORT_FAILED: 'Импорт прерван. Уже обработанные строки сохранятся при повторе.',
  VIDEO_FAILED: 'Не удалось обработать видео. Проверьте MP4 и доступность обработчика.',
  OWNER_REVOKED: 'Полномочия владельца отозваны',
  WORKER_INTERRUPTED: 'Обработчик был остановлен',
};
export const statusLabels: Record<string, string> = {
  preview: 'Предпросмотр',
  queued: 'В очереди',
  running: 'Выполняется',
  succeeded: 'Готово',
  failed: 'Ошибка',
  cancelled: 'Отменено',
};
export function csvCell(value: unknown) {
  const s = String(value ?? '');
  return '"' + (/^[\s]*[=+@-]/.test(s) ? "'" + s : s).replaceAll('"', '""') + '"';
}
export function parseCsv(text: string): string[][] {
  if (text.length > 2000000) throw new Error('Таблица слишком большая');
  const delimiter = text.split(/\r?\n/, 1)[0].includes(';') ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [],
    cell = '',
    quoted = false,
    closed = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (quoted) {
        quoted = false;
        closed = true;
      } else if (cell !== '' || closed) throw new Error('Некорректные кавычки CSV');
      else quoted = true;
    } else if (c === delimiter && !quoted) {
      row.push(cell);
      cell = '';
      closed = false;
    } else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some((v) => v.trim())) rows.push(row);
      row = [];
      cell = '';
      closed = false;
    } else {
      if (closed) throw new Error('Некорректные кавычки CSV');
      cell += c;
    }
    if (cell.length > 1000 || rows.length > 501 || row.length > 20)
      throw new Error('Не более 500 строк, 20 колонок, ячейки до 1000 символов');
  }
  if (quoted) throw new Error('Незакрытые кавычки CSV');
  row.push(cell);
  if (row.some((v) => v.trim())) rows.push(row);
  return rows;
}
export function rowsFromTable(table: string[][]): ImportRow[] {
  if (table.length < 2 || table.length > 501) throw new Error('Нужно от 1 до 500 учеников');
  const aliases: Record<string, string> = {
    email: 'email',
    почта: 'email',
    'электронная почта': 'email',
    имя: 'first_name',
    first_name: 'first_name',
    фамилия: 'last_name',
    last_name: 'last_name',
  };
  const headers = table[0].map(
    (v) =>
      aliases[
        v
          .trim()
          .replace(/^\uFEFF/, '')
          .toLowerCase()
      ] ?? '',
  );
  if (
    !headers.includes('email') ||
    !headers.includes('first_name') ||
    new Set(headers.filter(Boolean)).size !== headers.filter(Boolean).length
  )
    throw new Error('Колонки: email, first_name (имя), last_name (фамилия)');
  return table.slice(1).map((row) => ({
    email: String(row[headers.indexOf('email')] ?? '')
      .trim()
      .toLowerCase(),
    first_name: String(row[headers.indexOf('first_name')] ?? '').trim(),
    last_name: String(row[headers.indexOf('last_name')] ?? '').trim(),
  }));
}
