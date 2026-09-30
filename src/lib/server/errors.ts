import 'server-only';
import { ZodError } from 'zod';
import { reportError } from './monitoring';
export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
    public retryAfter?: number,
  ) {
    super(message);
  }
}
const messages: Record<string, string> = {
  EDIT_CONFLICT: 'Курс изменён в другой вкладке. Загрузите актуальную версию перед сохранением.',
  SLUG_TAKEN: 'Этот адрес уже занят. Выберите другой.',
  LESSON_SLUG_RESERVED: 'Этот адрес урока используется для перенаправления.',
  LAST_ADMIN: 'Нельзя отключить или понизить последнего администратора.',
  ASSET_IN_USE: 'Файл используется в курсе или настройках.',
  EMPTY_COURSE: 'Добавьте хотя бы один опубликованный урок.',
  EMPTY_LESSON: 'Добавьте содержимое во все публикуемые уроки.',
  LESSON_LOCKED: 'Сначала завершите предыдущие уроки.',
  FORBIDDEN: 'Недостаточно прав для этого действия.',
  INVALID_ASSET: 'Материал не загружен или недоступен.',
  INVALID_COVER: 'Загрузите изображение для обложки.',
  SESSION_EXPIRED: 'Сессия администратора истекла. Войдите заново.',
  MFA_REQUIRED: 'Подтвердите вход кодом аутентификатора.',
  UPLOAD_CONFLICT: 'Загрузка уже завершена или её параметры изменились.',
};
export function databaseError(error: { message: string; code?: string } | null) {
  if (!error) return;
  const entry = Object.entries(messages).find(([key]) => error.message.includes(key));
  if (entry)
    throw new AppError(
      entry[1],
      entry[0] === 'EDIT_CONFLICT' ? 409 : error.code === '42501' ? 403 : 400,
    );
  if (error.code === '23503') throw new AppError('Элемент используется и не может быть удалён.');
  if (error.code === '23505') throw new AppError('Такой элемент уже существует.');
  throw new AppError('Не удалось выполнить операцию. Попробуйте ещё раз.', 500);
}
export function rpcResult<T>(data: unknown): T {
  if (data && typeof data === 'object' && 'error' in data && data.error === 'RATE_LIMIT')
    throw new AppError(
      'Слишком много запросов. Подождите немного.',
      429,
      'retryAfter' in data ? Number(data.retryAfter) : 60,
    );
  return data as T;
}
export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string; status: number; retryAfter?: number; requestId?: string };
export async function actionResult<T>(operation: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await operation() };
  } catch (error) {
    if (error instanceof ZodError)
      return { ok: false, error: 'Проверьте параметры запроса.', status: 400 };
    if (error instanceof Error && 'digest' in error) throw error;
    if (error instanceof AppError) {
      const correlation =
        error.status >= 500 ? await reportError('action.failed', error) : undefined;
      return {
        ok: false,
        error: error.message,
        status: error.status,
        retryAfter: error.retryAfter,
        requestId: correlation,
      };
    }
    const correlation = await reportError('action.failed', error);
    return {
      ok: false,
      error: 'Не удалось выполнить действие. Попробуйте ещё раз.',
      status: 500,
      requestId: correlation,
    };
  }
}
