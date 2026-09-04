
-- Realtime RLS: allow members to READ moderation events on bonk-mod-*, but
-- no INSERT policy exists for authenticated so members cannot spoof mod
-- events. Only service_role (server-side) can send, bypassing RLS.
DROP POLICY IF EXISTS "bonk mod: members can read" ON realtime.messages;
CREATE POLICY "bonk mod: members can read"
ON realtime.messages FOR SELECT TO authenticated
USING (
  realtime.topic() LIKE 'bonk-mod-%'
  AND EXISTS (
    SELECT 1 FROM public.bonk_members bm
    WHERE bm.user_id = auth.uid()
      AND ('bonk-mod-' || bm.bonk_id::text) = realtime.topic()
  )
);
