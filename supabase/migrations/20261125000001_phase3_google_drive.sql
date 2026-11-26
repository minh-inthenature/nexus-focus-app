-- ==============================================================================
-- Nexus Phase 3 Migration: Google Drive OAuth, Connections, and Note Mappings
-- ==============================================================================
-- Preserves clean architectural boundaries:
--   - private.* tables: OAuth PKCE states and encrypted Drive tokens (Edge Functions only)
--   - public.drive_connections: non-sensitive Drive connection status & Nexus folder IDs
--   - public.drive_note_mappings: local_note_id <-> drive_file_id version metadata
-- ==============================================================================

CREATE SCHEMA IF NOT EXISTS private;

REVOKE ALL ON SCHEMA private FROM PUBLIC;
REVOKE ALL ON SCHEMA private FROM anon;
REVOKE ALL ON SCHEMA private FROM authenticated;

CREATE OR REPLACE FUNCTION public.nexus_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------------------------
-- Ephemeral PKCE & CSRF states for Google Drive OAuth Authorization Code flow
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS private.drive_oauth_states (
  state text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_verifier text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_drive_oauth_states_expires_at
  ON private.drive_oauth_states (expires_at);

-- ------------------------------------------------------------------------------
-- Encrypted Google Drive OAuth tokens (AES-256-GCM ciphertext stored server-side)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS private.google_drive_tokens (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  encrypted_access_token text NOT NULL,
  encrypted_refresh_token text,
  token_expires_at timestamptz NOT NULL,
  scope text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------------------------
-- User-visible Google Drive connection status and Nexus/ folder IDs
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.drive_connections (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('connected', 'disconnected', 'revoked')),
  root_folder_id text,
  notes_folder_id text,
  attachments_folder_id text,
  backups_folder_id text,
  scope text,
  connected_at timestamptz,
  last_operation_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_drive_connections_updated_at ON public.drive_connections;
CREATE TRIGGER trg_drive_connections_updated_at
  BEFORE UPDATE ON public.drive_connections
  FOR EACH ROW
  EXECUTE FUNCTION public.nexus_set_updated_at();

ALTER TABLE public.drive_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "drive_connections_select_own" ON public.drive_connections;
CREATE POLICY "drive_connections_select_own"
  ON public.drive_connections
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "drive_connections_insert_own" ON public.drive_connections;
CREATE POLICY "drive_connections_insert_own"
  ON public.drive_connections
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "drive_connections_update_own" ON public.drive_connections;
CREATE POLICY "drive_connections_update_own"
  ON public.drive_connections
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "drive_connections_delete_own" ON public.drive_connections;
CREATE POLICY "drive_connections_delete_own"
  ON public.drive_connections
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ------------------------------------------------------------------------------
-- Mapping between local IndexedDB note UUIDs and Google Drive file IDs
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.drive_note_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  local_note_id text NOT NULL,
  drive_file_id text NOT NULL,
  drive_folder_id text NOT NULL,
  drive_file_name text,
  last_known_modified_time timestamptz,
  last_known_checksum text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_drive_note_mappings_user_local UNIQUE (user_id, local_note_id),
  CONSTRAINT uq_drive_note_mappings_user_drive UNIQUE (user_id, drive_file_id)
);

CREATE INDEX IF NOT EXISTS idx_drive_note_mappings_user_id
  ON public.drive_note_mappings (user_id);

DROP TRIGGER IF EXISTS trg_drive_note_mappings_updated_at ON public.drive_note_mappings;
CREATE TRIGGER trg_drive_note_mappings_updated_at
  BEFORE UPDATE ON public.drive_note_mappings
  FOR EACH ROW
  EXECUTE FUNCTION public.nexus_set_updated_at();

ALTER TABLE public.drive_note_mappings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "drive_note_mappings_select_own" ON public.drive_note_mappings;
CREATE POLICY "drive_note_mappings_select_own"
  ON public.drive_note_mappings
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "drive_note_mappings_insert_own" ON public.drive_note_mappings;
CREATE POLICY "drive_note_mappings_insert_own"
  ON public.drive_note_mappings
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "drive_note_mappings_update_own" ON public.drive_note_mappings;
CREATE POLICY "drive_note_mappings_update_own"
  ON public.drive_note_mappings
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "drive_note_mappings_delete_own" ON public.drive_note_mappings;
CREATE POLICY "drive_note_mappings_delete_own"
  ON public.drive_note_mappings
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
