-- ==============================================================================
-- Nexus Phase 6 Migration: Calendar Events & Supabase Synchronization
-- ==============================================================================
-- Calendar events are structured application data stored in Supabase with strict
-- user-scoped RLS and synchronized with IndexedDB (`nexus_db` v5).
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.calendar_events (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  location text,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  all_day boolean NOT NULL DEFAULT false,
  timezone text,
  category text NOT NULL DEFAULT 'personal'
    CHECK (category IN ('study', 'work', 'personal', 'meeting', 'other')),
  color text,
  linked_note_ids text[] NOT NULL DEFAULT '{}',
  linked_task_ids text[] NOT NULL DEFAULT '{}',
  revision integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT chk_calendar_events_valid_range CHECK (end_at >= start_at)
);

CREATE INDEX IF NOT EXISTS idx_calendar_events_user_deleted
  ON public.calendar_events (user_id, deleted_at);

CREATE INDEX IF NOT EXISTS idx_calendar_events_user_start
  ON public.calendar_events (user_id, start_at);

CREATE INDEX IF NOT EXISTS idx_calendar_events_user_category
  ON public.calendar_events (user_id, category);

DROP TRIGGER IF EXISTS trg_calendar_events_updated_at ON public.calendar_events;
CREATE TRIGGER trg_calendar_events_updated_at
  BEFORE UPDATE ON public.calendar_events
  FOR EACH ROW
  EXECUTE FUNCTION public.nexus_set_updated_at();

ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "calendar_events_select_own" ON public.calendar_events;
CREATE POLICY "calendar_events_select_own"
  ON public.calendar_events FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "calendar_events_insert_own" ON public.calendar_events;
CREATE POLICY "calendar_events_insert_own"
  ON public.calendar_events FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "calendar_events_update_own" ON public.calendar_events;
CREATE POLICY "calendar_events_update_own"
  ON public.calendar_events FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "calendar_events_delete_own" ON public.calendar_events;
CREATE POLICY "calendar_events_delete_own"
  ON public.calendar_events FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
