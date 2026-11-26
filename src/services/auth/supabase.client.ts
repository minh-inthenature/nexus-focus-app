import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getPublicEnvConfig } from '@/utils/env';

let cachedClient: SupabaseClient | null | undefined;

/**
 * Returns the lazily initialized Supabase client when public environment
 * variables are configured, or `null` in local-only environments.
 */
export function getSupabaseClient(): SupabaseClient | null {
  if (cachedClient !== undefined) {
    return cachedClient;
  }

  const { supabaseUrl, supabaseAnonKey } = getPublicEnvConfig();
  if (!supabaseUrl || !supabaseAnonKey) {
    cachedClient = null;
    return null;
  }

  cachedClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
  });

  return cachedClient;
}
