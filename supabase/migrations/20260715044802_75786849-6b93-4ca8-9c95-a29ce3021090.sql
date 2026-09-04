-- Tighten user_badges: remove broad "read all equipped" policy; expose equipped
-- badges only via a security-definer view with minimal columns.
DROP POLICY IF EXISTS "Read equipped-only for public view" ON public.user_badges;

ALTER VIEW public.equipped_badges_public SET (security_invoker = false);
GRANT SELECT ON public.equipped_badges_public TO authenticated, anon;