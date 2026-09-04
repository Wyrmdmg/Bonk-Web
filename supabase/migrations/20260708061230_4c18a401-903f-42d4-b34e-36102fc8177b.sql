ALTER TABLE public.bonks
  ADD COLUMN IF NOT EXISTS auto_restart boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS restart_at timestamptz;