REVOKE EXECUTE ON FUNCTION public.get_equipped_badges(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_equipped_badges(uuid[]) TO service_role;