import 'server-only';
import { parseEnvironment, type RuntimeEnvironment } from '../config';
let config: RuntimeEnvironment | undefined;
export function runtimeEnvironment() {
  return config ??= parseEnvironment(process.env);
}
export function environment() {
  const env = runtimeEnvironment();
  return {
    appUrl: env.APP_URL,
    supabaseUrl: env.SUPABASE_URL,
    publishableKey: env.SUPABASE_PUBLISHABLE_KEY,
  };
}
export function serverSecret(name: 'SUPABASE_SECRET_KEY' | 'RATE_LIMIT_SECRET') {
  return runtimeEnvironment()[name];
}
