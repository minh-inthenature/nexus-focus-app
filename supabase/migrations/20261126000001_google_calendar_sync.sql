-- ==============================================================================
-- Nexus Google Calendar Two-Way Sync Migration
-- ==============================================================================
-- Preserves clean security boundaries matching Nexus's Google Drive architecture:
--   - private.* tables: OAuth PKCE states & AES-256-GCM encrypted Calendar tokens
--   - public.google_calendar_connections: non-sensitive status & incremental syncToken
--   - public.calendar_events: Google Calendar mapping columns (id, calendar, etag)
-- ==============================================================================

CREATE SCHEMA IF NOT EXISTS private;

REVOKE ALL ON SCHEMA private FROM PUBLIC;
REVOKE ALL ON SCHEMA private FROM anon;
REVOKE ALL ON SCHEMA private FROM authenticated;

-- ------------------------------------------------------------------------------
-- Ephemeral PKCE & CSRF states for Google Calendar OAuth Authorization Code flow
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS private.calendar_oauth_states (
  state text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_verifier text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calendar_oauth_states_expires_at
  ON private.calendar_oauth_states (expires_at);

-- ------------------------------------------------------------------------------
-- Encrypted Google Calendar OAuth tokens (server-side Edge Functions only)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS private.google_calendar_tokens (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  encrypted_access_token text NOT NULL,
  encrypted_refresh_token text,
  token_expires_at timestamptz NOT NULL,
  scope text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------------------------
-- User-visible Google Calendar connection status and incremental sync state
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.google_calendar_connections (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('connected', 'disconnected', 'revoked')),
  calendar_id text NOT NULL DEFAULT 'primary',
  calendar_summary text,
  scope text,
  sync_token text,
  connected_at timestamptz,
  last_synced_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_google_calendar_connections_updated_at
  ON public.google_calendar_connections;
CREATE TRIGGER trg_google_calendar_connections_updated_at
  BEFORE UPDATE ON public.google_calendar_connections
  FOR EACH ROW
  EXECUTE FUNCTION public.nexus_set_updated_at();

ALTER TABLE public.google_calendar_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "google_calendar_connections_select_own"
  ON public.google_calendar_connections;
CREATE POLICY "google_calendar_connections_select_own"
  ON public.google_calendar_connections
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "google_calendar_connections_insert_own"
  ON public.google_calendar_connections;
CREATE POLICY "google_calendar_connections_insert_own"
  ON public.google_calendar_connections
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "google_calendar_connections_update_own"
  ON public.google_calendar_connections;
CREATE POLICY "google_calendar_connections_update_own"
  ON public.google_calendar_connections
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "google_calendar_connections_delete_own"
  ON public.google_calendar_connections;
CREATE POLICY "google_calendar_connections_delete_own"
  ON public.google_calendar_connections
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ------------------------------------------------------------------------------
-- Add Google Calendar metadata columns to public.calendar_events
-- ------------------------------------------------------------------------------
ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS google_event_id text,
  ADD COLUMN IF NOT EXISTS google_calendar_id text,
  ADD COLUMN IF NOT EXISTS google_etag text,
  ADD COLUMN IF NOT EXISTS google_updated_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS uq_calendar_events_user_google_event
  ON public.calendar_events (user_id, google_event_id)
  WHERE google_event_id IS NOT NULL;
