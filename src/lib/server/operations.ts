import 'server-only';
import { userClient } from './supabase';
import { databaseError, rpcResult } from './errors';
import type { Json } from '../database.types';
export async function operations<T>(op: string, payload: Record<string, unknown> = {}) {
  const { data, error } = await (
    await userClient()
  ).rpc('operations', { op, payload: payload as Json });
  databaseError(error);
  return rpcResult<T>(data);
}
export async function workerStatus() {
  const w = await operations<{
    heartbeat_at?: string;
    capabilities?: { bot_username?: string; video?: boolean };
  }>('worker');
  return { ...w, online: !!w.heartbeat_at && Date.now() - Date.parse(w.heartbeat_at) < 90000 };
}
