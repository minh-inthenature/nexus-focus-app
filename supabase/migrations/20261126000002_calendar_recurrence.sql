-- ==============================================================================
-- Nexus Calendar Recurrence Support Migration (`RRULE` & `EXDATE`)
-- ==============================================================================
ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS rrule text,
  ADD COLUMN IF NOT EXISTS exdates text[] NOT NULL DEFAULT '{}';
