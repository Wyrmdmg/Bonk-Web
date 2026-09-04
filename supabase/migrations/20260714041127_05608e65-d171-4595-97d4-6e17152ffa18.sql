
-- === 1) focus_sessions: server-verified focus block tracking ===
CREATE TABLE IF NOT EXISTS public.focus_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('solo','bonk')),
  bonk_id UUID NULL REFERENCES public.bonks(id) ON DELETE SET NULL,
  planned_seconds INT NOT NULL CHECK (planned_seconds > 0 AND planned_seconds <= 10800),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  awarded_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS focus_sessions_user_idx ON public.focus_sessions(user_id);
CREATE INDEX IF NOT EXISTS focus_sessions_started_idx ON public.focus_sessions(started_at);

GRANT SELECT, INSERT, UPDATE ON public.focus_sessions TO authenticated;
GRANT ALL ON public.focus_sessions TO service_role;

ALTER TABLE public.focus_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own focus sessions"
  ON public.focus_sessions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
-- Inserts + awards go through server functions using service_role; block direct client writes.
CREATE POLICY "No client inserts"
  ON public.focus_sessions FOR INSERT TO authenticated
  WITH CHECK (false);
CREATE POLICY "No client updates"
  ON public.focus_sessions FOR UPDATE TO authenticated
  USING (false);

-- === 2) equipped_badges_public view: minimal exposure for cross-user rendering ===
DROP POLICY IF EXISTS "Anyone can read equipped badges" ON public.user_badges;

CREATE OR REPLACE VIEW public.equipped_badges_public
WITH (security_invoker = true) AS
SELECT ub.user_id, ub.badge_key, ub.expires_at
FROM public.user_badges ub
WHERE ub.equipped = true AND ub.expires_at > now();

-- View inherits RLS of base table via security_invoker; the base table's
-- "Users read own badges" policy alone would hide other users' rows, so we
-- add a purpose-scoped policy on the base table that ONLY the view will use.
-- The view exposes just (user_id, badge_key, expires_at) - no purchased_at,
-- no equipped flag semantics beyond "currently on".
CREATE POLICY "Read equipped-only for public view"
  ON public.user_badges FOR SELECT TO authenticated
  USING (equipped = true AND expires_at > now());
-- NOTE: this policy still permits direct table reads of that narrow slice.
-- Followup migration hardening: revoke SELECT on user_badges via a view-only
-- pattern would require dropping authenticated SELECT entirely and moving
-- owner reads through an RPC. Kept as-is to preserve owner realtime updates.

GRANT SELECT ON public.equipped_badges_public TO authenticated;

-- === 3) Chat realtime: bind sender identity to auth.uid() ===
-- The msg payload's user_id must match the caller. Prior policy only checked
-- membership, letting a member fake another user's user_id in the payload.
DROP POLICY IF EXISTS "bonk chat: members can send" ON realtime.messages;
CREATE POLICY "bonk chat: members can send"
ON realtime.messages FOR INSERT TO authenticated
WITH CHECK (
  realtime.topic() LIKE 'bonk-chat-%'
  AND EXISTS (
    SELECT 1 FROM public.bonk_members bm
    WHERE bm.user_id = auth.uid()
      AND ('bonk-chat-' || bm.bonk_id::text) = realtime.topic()
  )
  AND (
    -- Broadcast payload arrives as { event, type, payload: {...} } under the
    -- realtime.messages.payload jsonb. Force the caller-declared user_id to
    -- match their auth uid so members cannot spoof another user's messages.
    (payload -> 'payload' ->> 'user_id') = (auth.uid())::text
  )
);
