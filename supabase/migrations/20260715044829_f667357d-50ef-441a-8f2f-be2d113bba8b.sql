DROP VIEW IF EXISTS public.equipped_badges_public;

CREATE OR REPLACE FUNCTION public.get_equipped_badges(_user_ids uuid[])
RETURNS TABLE(user_id uuid, badge_key text, expires_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ub.user_id, ub.badge_key, ub.expires_at
  FROM public.user_badges ub
  WHERE ub.equipped = true
    AND ub.expires_at > now()
    AND ub.user_id = ANY(_user_ids)
$$;

REVOKE ALL ON FUNCTION public.get_equipped_badges(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_equipped_badges(uuid[]) TO authenticated;