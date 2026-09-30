export function authenticateWebhook(actual: string | null, expected: string | undefined): boolean;
export function telegramUpdate(input: unknown): {
  update_id: number;
  chat_id: number;
  telegram_id: number;
  chat_type: string;
  command: string;
  token?: string;
  course_id?: string;
} | null;
export function reportCsv(rows: Record<string, unknown>[]): string;
export function telegramCall(
  token: string,
  method: string,
  data: unknown,
  options?: unknown,
): Promise<unknown>;
export function deliverReport(
  token: string,
  job: unknown,
  data: unknown,
  fetcher?: unknown,
  receipt?: (id: string) => Promise<unknown>,
  authorize?: (id: string) => Promise<{ id: string; chat_id: number } | null>,
): Promise<unknown>;
