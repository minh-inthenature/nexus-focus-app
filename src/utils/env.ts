export interface PublicEnvConfig {
  readonly supabaseUrl: string | undefined;
  readonly supabaseAnonKey: string | undefined;
  readonly googleClientId: string | undefined;
}

export interface IntegrationConfigStatus {
  readonly supabaseConfigured: boolean;
  readonly googleDriveConfigured: boolean;
}

function normalizeEnvValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Safely reads public client-side Vite environment variables without throwing
 * when optional future integrations are not yet configured.
 */
export function getPublicEnvConfig(): PublicEnvConfig {
  return {
    supabaseUrl: normalizeEnvValue(import.meta.env.VITE_SUPABASE_URL),
    supabaseAnonKey: normalizeEnvValue(import.meta.env.VITE_SUPABASE_ANON_KEY),
    googleClientId: normalizeEnvValue(import.meta.env.VITE_GOOGLE_CLIENT_ID),
  };
}

/**
 * Reports whether public environment variables for upcoming cloud services
 * are present. Never exposes raw key values in UI state.
 */
export function getIntegrationConfigStatus(): IntegrationConfigStatus {
  const env = getPublicEnvConfig();
  return {
    supabaseConfigured: Boolean(env.supabaseUrl && env.supabaseAnonKey),
    googleDriveConfigured: Boolean(env.googleClientId),
  };
}
