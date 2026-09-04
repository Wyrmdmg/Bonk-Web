-- What the Supabase advisor found, and what is actually wrong with each.
--
-- 1. get_my_link_code() answers the anon role. It is SECURITY DEFINER, so it
--    runs as its owner, and the only thing keeping it honest is its own
--    "where user_id = auth.uid()" — which for a signed-out caller is null, so
--    it returns nothing. Harmless today, one edit away from not being. The
--    grants it was given in 20260724081412 did not survive the move to this
--    project, so they are re-asserted here.
--
--    Nothing in the app has called it since the profile-link feature was
--    dropped, so it loses authenticated too. Reviving that feature is one
--    GRANT: grant execute on function public.get_my_link_code() to authenticated;
--
-- 2. rls_auto_enable() was never in this repo. It came from the project this
--    database was cloned out of, and it is the kind of helper that turns RLS on
--    for new tables — exactly the sort of thing no signed-out stranger should be
--    able to fire. It is only revoked, not dropped: an event trigger may still
--    own it, and dropping a function out from under one breaks DDL for everyone.
--
-- 3. bonk_secrets and profile_link_codes have RLS on and no policies, which the
--    advisor reports as INFO. That is the intended state, not an oversight: no
--    policy means no row is ever visible, and both tables are only ever touched
--    by the service role, which bypasses RLS. Adding a policy would open them.
--    Revoking the table grants says the same thing one layer earlier, so they
--    stop being reachable rather than merely empty.

REVOKE ALL ON FUNCTION public.get_my_link_code() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_link_code() FROM anon, authenticated;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'rls_auto_enable'
  ) THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC';
    EXECUTE 'REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM anon, authenticated';
  END IF;
END
$$;

REVOKE ALL ON TABLE public.bonk_secrets FROM anon, authenticated;
REVOKE ALL ON TABLE public.profile_link_codes FROM anon, authenticated;

COMMENT ON TABLE public.bonk_secrets IS
  'Hashed room passwords. RLS on with no policy on purpose: server-role only, no row is ever visible to a client.';
COMMENT ON TABLE public.profile_link_codes IS
  'RLS on with no policy on purpose: server-role only. Unused since the profile-link feature was dropped.';

NOTIFY pgrst, 'reload schema';
