
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_seen timestamptz;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_status_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_status_check
  CHECK (status IN ('online','idle','dnd','invisible','offline'));

UPDATE public.profiles SET status = 'offline', last_seen = NULL;
