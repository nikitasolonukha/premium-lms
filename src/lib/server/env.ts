import 'server-only';
function required(key: string) {
  const value = process.env[key];
  if (!value) throw new Error(`Missing server environment variable: ${key}`);
  return value;
}
export function environment() {
  const appUrl = required('APP_URL');
  if (
    process.env.NODE_ENV === 'production' &&
    !appUrl.startsWith('https://') &&
    !/^http:\/\/(localhost|127\.0\.0\.1):/.test(appUrl)
  )
    throw new Error('Production APP_URL must use HTTPS');
  return {
    appUrl,
    supabaseUrl: required('SUPABASE_URL'),
    publishableKey: required('SUPABASE_PUBLISHABLE_KEY'),
  };
}
export function serverSecret(name: 'SUPABASE_SECRET_KEY' | 'RATE_LIMIT_SECRET') {
  const value = required(name);
  if (name === 'RATE_LIMIT_SECRET' && value.length < 32)
    throw new Error('RATE_LIMIT_SECRET must contain at least 32 characters');
  return value;
}
