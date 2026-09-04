
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS discord_id text,
  ADD COLUMN IF NOT EXISTS link_code text,
  ADD COLUMN IF NOT EXISTS link_code_expires_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_discord_id_key
  ON public.profiles (discord_id)
  WHERE discord_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_link_code_key
  ON public.profiles (link_code)
  WHERE link_code IS NOT NULL;
