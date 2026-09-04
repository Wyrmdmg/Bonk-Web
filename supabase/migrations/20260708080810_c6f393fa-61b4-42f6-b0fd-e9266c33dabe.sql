REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (display_name) ON public.profiles TO authenticated;

DROP POLICY IF EXISTS profiles_update_self ON public.profiles;
CREATE POLICY profiles_update_self ON public.profiles
FOR UPDATE TO authenticated
USING (auth.uid() = id)
WITH CHECK (
  auth.uid() = id
  AND username        = (SELECT p.username        FROM public.profiles p WHERE p.id = auth.uid())
  AND xp              = (SELECT p.xp              FROM public.profiles p WHERE p.id = auth.uid())
  AND current_streak  = (SELECT p.current_streak  FROM public.profiles p WHERE p.id = auth.uid())
  AND longest_streak  = (SELECT p.longest_streak  FROM public.profiles p WHERE p.id = auth.uid())
  AND last_focus_date IS NOT DISTINCT FROM (SELECT p.last_focus_date FROM public.profiles p WHERE p.id = auth.uid())
);