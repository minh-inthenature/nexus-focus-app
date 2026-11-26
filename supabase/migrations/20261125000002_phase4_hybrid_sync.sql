-- ==============================================================================
-- Nexus Phase 4 Migration: Hybrid Synchronization Metadata & RLS
-- ==============================================================================
-- Preserves local-first privacy & boundaries:
--   - Markdown note bodies and binary attachments live in IndexedDB + Google Drive
--   - Supabase stores synchronization metadata, ID mappings, and tombstones ONLY
-- ==============================================================================

-- 1. Extend public.drive_note_mappings with structured note metadata (no Markdown body)
ALTER TABLE public.drive_note_mappings
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS local_folder_id text,
  ADD COLUMN IF NOT EXISTS is_favorite boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_daily boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS daily_date text,
  ADD COLUMN IF NOT EXISTS local_revision integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- 2. Folder hierarchy synchronization metadata
CREATE TABLE IF NOT EXISTS public.sync_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  local_folder_id text NOT NULL,
  name text NOT NULL,
  parent_folder_id text,
  revision integer NOT NULL DEFAULT 1,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_sync_folders_user_local UNIQUE (user_id, local_folder_id)
);

CREATE INDEX IF NOT EXISTS idx_sync_folders_user_id
  ON public.sync_folders (user_id);

DROP TRIGGER IF EXISTS trg_sync_folders_updated_at ON public.sync_folders;
CREATE TRIGGER trg_sync_folders_updated_at
  BEFORE UPDATE ON public.sync_folders
  FOR EACH ROW
  EXECUTE FUNCTION public.nexus_set_updated_at();

ALTER TABLE public.sync_folders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sync_folders_select_own" ON public.sync_folders;
CREATE POLICY "sync_folders_select_own"
  ON public.sync_folders FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "sync_folders_insert_own" ON public.sync_folders;
CREATE POLICY "sync_folders_insert_own"
  ON public.sync_folders FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "sync_folders_update_own" ON public.sync_folders;
CREATE POLICY "sync_folders_update_own"
  ON public.sync_folders FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "sync_folders_delete_own" ON public.sync_folders;
CREATE POLICY "sync_folders_delete_own"
  ON public.sync_folders FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- 3. Attachment Drive mapping & metadata
CREATE TABLE IF NOT EXISTS public.sync_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  local_attachment_id text NOT NULL,
  local_note_id text NOT NULL,
  drive_file_id text NOT NULL,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL DEFAULT 0,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_sync_attachments_user_local UNIQUE (user_id, local_attachment_id)
);

CREATE INDEX IF NOT EXISTS idx_sync_attachments_user_id
  ON public.sync_attachments (user_id);

DROP TRIGGER IF EXISTS trg_sync_attachments_updated_at ON public.sync_attachments;
CREATE TRIGGER trg_sync_attachments_updated_at
  BEFORE UPDATE ON public.sync_attachments
  FOR EACH ROW
  EXECUTE FUNCTION public.nexus_set_updated_at();

ALTER TABLE public.sync_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sync_attachments_select_own" ON public.sync_attachments;
CREATE POLICY "sync_attachments_select_own"
  ON public.sync_attachments FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "sync_attachments_insert_own" ON public.sync_attachments;
CREATE POLICY "sync_attachments_insert_own"
  ON public.sync_attachments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "sync_attachments_update_own" ON public.sync_attachments;
CREATE POLICY "sync_attachments_update_own"
  ON public.sync_attachments FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "sync_attachments_delete_own" ON public.sync_attachments;
CREATE POLICY "sync_attachments_delete_own"
  ON public.sync_attachments FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- 4. Per-user synchronization checkpoint state
CREATE TABLE IF NOT EXISTS public.sync_state (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_synced_at timestamptz,
  sync_version bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_sync_state_updated_at ON public.sync_state;
CREATE TRIGGER trg_sync_state_updated_at
  BEFORE UPDATE ON public.sync_state
  FOR EACH ROW
  EXECUTE FUNCTION public.nexus_set_updated_at();

ALTER TABLE public.sync_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sync_state_select_own" ON public.sync_state;
CREATE POLICY "sync_state_select_own"
  ON public.sync_state FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "sync_state_insert_own" ON public.sync_state;
CREATE POLICY "sync_state_insert_own"
  ON public.sync_state FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "sync_state_update_own" ON public.sync_state;
CREATE POLICY "sync_state_update_own"
  ON public.sync_state FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "sync_state_delete_own" ON public.sync_state;
CREATE POLICY "sync_state_delete_own"
  ON public.sync_state FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
