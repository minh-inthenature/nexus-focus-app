-- ==============================================================================
-- Nexus Phase 5 Migration: Tasks Management & Supabase Synchronization
-- ==============================================================================
-- Tasks are structured application data stored in Supabase with strict RLS,
-- synchronized with local IndexedDB (`nexus_db` v4) via the Phase 4 sync engine.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.tasks (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done')),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  start_date date,
  due_date date,
  tags text[] NOT NULL DEFAULT '{}',
  category text,
  linked_note_ids text[] NOT NULL DEFAULT '{}',
  revision integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  deleted_at timestamptz,
  CONSTRAINT chk_tasks_valid_date_range CHECK (
    start_date IS NULL OR due_date IS NULL OR start_date <= due_date
  )
);

CREATE INDEX IF NOT EXISTS idx_tasks_user_deleted
  ON public.tasks (user_id, deleted_at);

CREATE INDEX IF NOT EXISTS idx_tasks_user_status
  ON public.tasks (user_id, status);

CREATE INDEX IF NOT EXISTS idx_tasks_user_due_date
  ON public.tasks (user_id, due_date);

DROP TRIGGER IF EXISTS trg_tasks_updated_at ON public.tasks;
CREATE TRIGGER trg_tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.nexus_set_updated_at();

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tasks_select_own" ON public.tasks;
CREATE POLICY "tasks_select_own"
  ON public.tasks FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "tasks_insert_own" ON public.tasks;
CREATE POLICY "tasks_insert_own"
  ON public.tasks FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "tasks_update_own" ON public.tasks;
CREATE POLICY "tasks_update_own"
  ON public.tasks FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "tasks_delete_own" ON public.tasks;
CREATE POLICY "tasks_delete_own"
  ON public.tasks FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
