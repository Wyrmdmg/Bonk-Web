ALTER TABLE public.bonks
  ADD COLUMN IF NOT EXISTS chat_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS chat_slow_mode_sec integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS afk_kick boolean NOT NULL DEFAULT false;

ALTER TABLE public.bonks
  DROP CONSTRAINT IF EXISTS bonks_chat_slow_mode_sec_range;
ALTER TABLE public.bonks
  ADD CONSTRAINT bonks_chat_slow_mode_sec_range
  CHECK (chat_slow_mode_sec >= 1 AND chat_slow_mode_sec <= 3600);