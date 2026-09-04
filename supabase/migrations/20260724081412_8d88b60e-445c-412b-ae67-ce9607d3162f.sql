-- Move Discord link codes out of the publicly-readable profiles table into
-- a dedicated table protected by service_role-only RLS (owner reads its own
-- code via a SECURITY DEFINER RPC below).

CREATE TABLE IF NOT EXISTS public.profile_link_codes (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  code text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS profile_link_codes_code_unique ON public.profile_link_codes (code);

GRANT ALL ON public.profile_link_codes TO service_role;
-- No grants to anon/authenticated: reads happen only via SECURITY DEFINER RPC
-- and service_role paths (server functions + public Discord webhook).

ALTER TABLE public.profile_link_codes ENABLE ROW LEVEL SECURITY;

-- Deny-all default: no policies for anon/authenticated. service_role bypasses RLS.

-- Migrate any existing codes over.
INSERT INTO public.profile_link_codes (user_id, code, expires_at)
SELECT id, link_code, link_code_expires_at
FROM public.profiles
WHERE link_code IS NOT NULL AND link_code_expires_at IS NOT NULL
ON CONFLICT (user_id) DO UPDATE SET
  code = EXCLUDED.code,
  expires_at = EXCLUDED.expires_at;

-- Drop the sensitive columns from the public profiles view.
ALTER TABLE public.profiles DROP COLUMN IF EXISTS link_code;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS link_code_expires_at;

-- Owner-only read RPC: returns the caller's active link code if not expired.
CREATE OR REPLACE FUNCTION public.get_my_link_code()
RETURNS TABLE(code text, expires_at timestamptz)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT code, expires_at
  FROM public.profile_link_codes
  WHERE user_id = auth.uid()
    AND expires_at > now()
$$;

REVOKE ALL ON FUNCTION public.get_my_link_code() FROM public;
GRANT EXECUTE ON FUNCTION public.get_my_link_code() TO authenticated;