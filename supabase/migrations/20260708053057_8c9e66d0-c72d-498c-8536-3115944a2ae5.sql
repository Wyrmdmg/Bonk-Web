DROP POLICY IF EXISTS bonk_bans_read ON public.bonk_bans;
CREATE POLICY bonk_bans_read_scoped ON public.bonk_bans
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR auth.uid() = banned_by
    OR EXISTS (SELECT 1 FROM public.bonks b WHERE b.id = bonk_bans.bonk_id AND b.host_id = auth.uid())
  );

DROP POLICY IF EXISTS user_foods_read_all ON public.user_foods;
CREATE POLICY user_foods_read_own ON public.user_foods
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

REVOKE SELECT ON public.bonk_bans FROM anon;
REVOKE SELECT ON public.user_foods FROM anon;