-- ==============================================================================
-- Nexus Feature: Minimalist Habit Tracker (`habits` & `habit_logs`)
-- ==============================================================================
-- Stores recurring habits and per-day completion logs (`YYYY-MM-DD` local date)
-- with strict per-user RLS policies and uniqueness on `(habit_id, completed_date)`.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.habits (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  category text NOT NULL DEFAULT 'Personal'
    CHECK (category IN ('Study', 'Health', 'Focus', 'Personal')),
  frequency text NOT NULL DEFAULT 'daily'
    CHECK (frequency IN ('daily', 'weekdays', 'custom_days')),
  target_days integer[] NOT NULL DEFAULT '{0,1,2,3,4,5,6}',
  accent_color text NOT NULL DEFAULT 'sage'
    CHECK (accent_color IN ('sage', 'amber', 'blue', 'terracotta', 'violet')),
  sort_order integer NOT NULL DEFAULT 0,
  is_archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_habits_user_archived_sort
  ON public.habits (user_id, is_archived, sort_order);

DROP TRIGGER IF EXISTS trg_habits_updated_at ON public.habits;
CREATE TRIGGER trg_habits_updated_at
  BEFORE UPDATE ON public.habits
  FOR EACH ROW
  EXECUTE FUNCTION public.nexus_set_updated_at();

ALTER TABLE public.habits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "habits_select_own" ON public.habits;
CREATE POLICY "habits_select_own"
  ON public.habits FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "habits_insert_own" ON public.habits;
CREATE POLICY "habits_insert_own"
  ON public.habits FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "habits_update_own" ON public.habits;
CREATE POLICY "habits_update_own"
  ON public.habits FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "habits_delete_own" ON public.habits;
CREATE POLICY "habits_delete_own"
  ON public.habits FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- ==============================================================================
-- Habit Completion Logs
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.habit_logs (
  id uuid PRIMARY KEY,
  habit_id uuid NOT NULL REFERENCES public.habits(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  completed_date text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_habit_logs_habit_date UNIQUE (habit_id, completed_date)
);

CREATE INDEX IF NOT EXISTS idx_habit_logs_user_date
  ON public.habit_logs (user_id, completed_date);

ALTER TABLE public.habit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "habit_logs_select_own" ON public.habit_logs;
CREATE POLICY "habit_logs_select_own"
  ON public.habit_logs FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "habit_logs_insert_own" ON public.habit_logs;
CREATE POLICY "habit_logs_insert_own"
  ON public.habit_logs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "habit_logs_update_own" ON public.habit_logs;
CREATE POLICY "habit_logs_update_own"
  ON public.habit_logs FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "habit_logs_delete_own" ON public.habit_logs;
CREATE POLICY "habit_logs_delete_own"
  ON public.habit_logs FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
