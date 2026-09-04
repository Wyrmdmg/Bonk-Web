
-- 1) Storage: avatars SELECT scoped to owner folder
DROP POLICY IF EXISTS "avatars: authenticated can read" ON storage.objects;
CREATE POLICY "avatars: owner can read"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'avatars' AND (auth.uid())::text = (storage.foldername(name))[1]);

-- 2) user_badges: split read policy - owner sees all; others only see currently equipped, non-expired
DROP POLICY IF EXISTS "Authenticated can read badges" ON public.user_badges;
CREATE POLICY "Users read own badges"
ON public.user_badges FOR SELECT TO authenticated
USING (auth.uid() = user_id);
CREATE POLICY "Anyone can read equipped badges"
ON public.user_badges FOR SELECT TO authenticated
USING (equipped = true AND expires_at > now());

-- 3) equip_badge: switch to SECURITY INVOKER. RLS on user_badges already
-- restricts users to their own rows, so DEFINER is not needed.
CREATE OR REPLACE FUNCTION public.equip_badge(_badge_key text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $function$
DECLARE
  uid UUID := auth.uid();
  ok BOOLEAN := false;
BEGIN
  IF uid IS NULL THEN RETURN false; END IF;

  UPDATE public.user_badges SET equipped = false WHERE user_id = uid AND equipped = true;

  IF _badge_key IS NULL OR _badge_key = '' THEN RETURN true; END IF;

  UPDATE public.user_badges
     SET equipped = true
   WHERE user_id = uid
     AND badge_key = _badge_key
     AND expires_at > now();

  GET DIAGNOSTICS ok = ROW_COUNT;
  RETURN ok > 0;
END;
$function$;

-- 4) Realtime RLS: restrict `bonk-chat-*` topic to actual bonk members.
--    Private channel enforcement uses realtime.messages policies.
DROP POLICY IF EXISTS "bonk chat: members can read" ON realtime.messages;
DROP POLICY IF EXISTS "bonk chat: members can send" ON realtime.messages;

CREATE POLICY "bonk chat: members can read"
ON realtime.messages FOR SELECT TO authenticated
USING (
  realtime.topic() LIKE 'bonk-chat-%'
  AND EXISTS (
    SELECT 1 FROM public.bonk_members bm
    WHERE bm.user_id = auth.uid()
      AND ('bonk-chat-' || bm.bonk_id::text) = realtime.topic()
  )
);

CREATE POLICY "bonk chat: members can send"
ON realtime.messages FOR INSERT TO authenticated
WITH CHECK (
  realtime.topic() LIKE 'bonk-chat-%'
  AND EXISTS (
    SELECT 1 FROM public.bonk_members bm
    WHERE bm.user_id = auth.uid()
      AND ('bonk-chat-' || bm.bonk_id::text) = realtime.topic()
  )
);
