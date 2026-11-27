-- ==============================================================================
-- Nexus Tasks Enhancement: Backlog & Task Groups
-- ==============================================================================
-- Adds optional `group_name` and `is_backlog` columns to `public.tasks`
-- for cross-device syncing of Task Groups and unscheduled Backlog tasks.
-- ==============================================================================

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS group_name text,
  ADD COLUMN IF NOT EXISTS is_backlog boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_tasks_user_group
  ON public.tasks (user_id, group_name);
