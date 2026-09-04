
CREATE TABLE public.bonk_bans (
  bonk_id UUID NOT NULL REFERENCES public.bonks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  banned_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (bonk_id, user_id)
);
CREATE INDEX bonk_bans_bonk_idx ON public.bonk_bans(bonk_id);
GRANT SELECT ON public.bonk_bans TO authenticated;
GRANT ALL ON public.bonk_bans TO service_role;
ALTER TABLE public.bonk_bans ENABLE ROW LEVEL SECURITY;
-- Anyone signed-in can read bans for a bonk (used to render UI); writes are server-side via admin.
CREATE POLICY "bonk_bans_read" ON public.bonk_bans FOR SELECT USING (true);
