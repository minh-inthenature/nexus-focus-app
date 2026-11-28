-- ==============================================================================
-- Nexus Tasks Enhancement: Task Starring, Duration & Due Time
-- ==============================================================================
-- Adds `is_starred`, `duration_minutes`, and `due_time` columns to `public.tasks`
-- for cross-device syncing across mobile and desktop.
-- ==============================================================================

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS is_starred boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS duration_minutes integer,
  ADD COLUMN IF NOT EXISTS due_time text;

CREATE INDEX IF NOT EXISTS idx_tasks_user_starred
  ON public.tasks (user_id, is_starred)
  WHERE is_starred = true;
