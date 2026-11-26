-- ==============================================================================
-- Nexus Dedicated Code Note Support Migration (`note_type` & `code_language`)
-- ==============================================================================
ALTER TABLE public.notes
  ADD COLUMN IF NOT EXISTS note_type text NOT NULL DEFAULT 'markdown',
  ADD COLUMN IF NOT EXISTS code_language text;
