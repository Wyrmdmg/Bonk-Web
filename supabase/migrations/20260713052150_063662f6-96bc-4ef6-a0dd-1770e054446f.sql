
-- 1) avatar_url on profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- 2) user_badges table
CREATE TABLE IF NOT EXISTS public.user_badges (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_key TEXT NOT NULL,
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  equipped BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, badge_key)
);

CREATE INDEX IF NOT EXISTS user_badges_user_idx ON public.user_badges(user_id);
CREATE INDEX IF NOT EXISTS user_badges_expires_idx ON public.user_badges(expires_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_badges TO authenticated;
GRANT ALL ON public.user_badges TO service_role;

ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;

-- Any signed-in user can read badges (needed to render them next to usernames)
CREATE POLICY "Authenticated can read badges"
  ON public.user_badges FOR SELECT
  TO authenticated
  USING (true);

-- Only owner can insert their own rows
CREATE POLICY "User can insert own badge"
  ON public.user_badges FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Only owner can update their own rows (used for equipping)
CREATE POLICY "User can update own badge"
  ON public.user_badges FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Only owner can delete their own rows
CREATE POLICY "User can delete own badge"
  ON public.user_badges FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- updated_at trigger
DROP TRIGGER IF EXISTS user_badges_updated_at ON public.user_badges;
CREATE TRIGGER user_badges_updated_at
  BEFORE UPDATE ON public.user_badges
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- equip helper: unequip everything for the user, then equip the target (if not expired)
CREATE OR REPLACE FUNCTION public.equip_badge(_badge_key TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  ok BOOLEAN := false;
BEGIN
  IF uid IS NULL THEN RETURN false; END IF;

  UPDATE public.user_badges SET equipped = false WHERE user_id = uid AND equipped = true;

  IF _badge_key IS NULL OR _badge_key = '' THEN RETURN true; END IF;

  UPDATE public.user_badges
     SET equipped = true
   WHERE user_id = uid
     AND badge_key = _badge_key
     AND expires_at > now();

  GET DIAGNOSTICS ok = ROW_COUNT;
  RETURN ok;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.equip_badge(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.equip_badge(TEXT) TO authenticated;
