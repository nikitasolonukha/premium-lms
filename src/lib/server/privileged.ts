import 'server-only';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../database.types';
import { environment, serverSecret } from './env';
// Import only from isolated rate-limit, file-validation/signing and account
// provisioning / deployment-config audit operations. Content reads and normal mutations use userClient.
export function privilegedClient() {
  return createClient<Database>(environment().supabaseUrl, serverSecret('SUPABASE_SECRET_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
