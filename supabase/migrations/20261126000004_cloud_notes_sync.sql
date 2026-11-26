-- ==============================================================================
-- Nexus Direct Cross-Device Cloud Notes Sync Migration (`public.notes`)
-- ==============================================================================
-- Enables automatic two-way cloud synchronization of Notes across all signed-in
-- devices without requiring a separate Google Drive OAuth Edge Function.
-- Preserves user isolation via Supabase Row Level Security (`auth.uid() = user_id`).
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.notes (
  id text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  folder_id text,
  title text NOT NULL,
  content text NOT NULL DEFAULT '',
  note_type text NOT NULL DEFAULT 'markdown',
  code_language text,
  is_favorite boolean NOT NULL DEFAULT false,
  is_daily boolean NOT NULL DEFAULT false,
  daily_date text,
  revision integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  PRIMARY KEY (user_id, id)
);

CREATE INDEX IF NOT EXISTS idx_notes_user_updated_at
  ON public.notes (user_id, updated_at DESC);

DROP TRIGGER IF EXISTS trg_notes_updated_at ON public.notes;
CREATE TRIGGER trg_notes_updated_at
  BEFORE UPDATE ON public.notes
  FOR EACH ROW
  EXECUTE FUNCTION public.nexus_set_updated_at();

ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notes_select_own" ON public.notes;
CREATE POLICY "notes_select_own"
  ON public.notes FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "notes_insert_own" ON public.notes;
CREATE POLICY "notes_insert_own"
  ON public.notes FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "notes_update_own" ON public.notes;
CREATE POLICY "notes_update_own"
  ON public.notes FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "notes_delete_own" ON public.notes;
CREATE POLICY "notes_delete_own"
  ON public.notes FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
