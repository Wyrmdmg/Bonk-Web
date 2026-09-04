
-- 1) bonk_secrets
CREATE TABLE public.bonk_secrets (
  bonk_id uuid PRIMARY KEY REFERENCES public.bonks(id) ON DELETE CASCADE,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.bonk_secrets TO service_role;
ALTER TABLE public.bonk_secrets ENABLE ROW LEVEL SECURITY;
-- No policies for anon/authenticated: table is only accessed via service role in server functions.

-- Backfill from bonks.password_hash
INSERT INTO public.bonk_secrets (bonk_id, password_hash)
SELECT id, password_hash FROM public.bonks WHERE password_hash IS NOT NULL;

ALTER TABLE public.bonks DROP COLUMN password_hash;

-- 2) profile_secrets
CREATE TABLE public.profile_secrets (
  id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  email text,
  recovery_code_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.profile_secrets TO authenticated;
GRANT ALL ON public.profile_secrets TO service_role;
ALTER TABLE public.profile_secrets ENABLE ROW LEVEL SECURITY;

-- Users can only read their own secrets row (email). recovery_code_hash is only read by server functions via service role.
CREATE POLICY profile_secrets_read_self ON public.profile_secrets
  FOR SELECT TO authenticated
  USING (auth.uid() = id);

-- Backfill
INSERT INTO public.profile_secrets (id, email, recovery_code_hash)
SELECT id, email, recovery_code_hash FROM public.profiles;

ALTER TABLE public.profiles DROP COLUMN email;
ALTER TABLE public.profiles DROP COLUMN recovery_code_hash;
