REVOKE SELECT (recovery_code_hash) ON public.profile_secrets FROM authenticated;
REVOKE SELECT (recovery_code_hash) ON public.profile_secrets FROM anon;