import 'server-only';
import { createHmac } from 'node:crypto';
import { headers } from 'next/headers';
import { runtimeEnvironment, serverSecret } from './env';
import { trustedClientIp } from '../request-security';
import { privilegedClient } from './privileged';
import { userClient } from './supabase';
import { AppError, databaseError } from './errors';
export async function userLimit(kind: 'search' | 'media' | 'admin' | 'learning') {
  const { data, error } = await (await userClient()).rpc('consume_user_limit', { kind });
  databaseError(error);
  if (data && data > 0) throw new AppError('Слишком много запросов. Попробуйте позже.', 429, data);
}
export async function authLimit(kind: 'login' | 'reset' | 'register', account: string) {
  const digest = (value: string) =>
    createHmac('sha256', serverSecret('RATE_LIMIT_SECRET'))
      .update(value.toLowerCase())
      .digest('hex');
  const db = privilegedClient();
  const { data, error } = await db.rpc('consume_service_limit', {
    k: `auth:${kind}:account:${digest(account)}`,
    maximum: kind === 'reset' ? 3 : 10,
    seconds: kind === 'reset' ? 3600 : 600,
  });
  databaseError(error);
  if (data && data > 0) throw new AppError('Лимит попыток исчерпан. Попробуйте позже.', 429, data);
  let ip: string | null;
  try { ip = trustedClientIp(await headers(), runtimeEnvironment()); }
  catch { throw new AppError('Не удалось определить источник запроса.', 503); }
  if (ip) {
    const result = await db.rpc('consume_service_limit', {
      k: `auth:${kind}:ip:${digest(ip)}`,
      maximum: kind === 'reset' ? 20 : 50,
      seconds: 600,
    });
    databaseError(result.error);
    if (result.data && result.data > 0)
      throw new AppError('Слишком много попыток с этого адреса.', 429, result.data);
  }
}
