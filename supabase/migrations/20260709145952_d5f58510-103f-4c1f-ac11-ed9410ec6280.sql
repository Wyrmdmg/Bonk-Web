
-- Add status column to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'online'
  CHECK (status IN ('online','idle','dnd','invisible'));

-- Allow authenticated users to update their own status
GRANT UPDATE (status) ON public.profiles TO authenticated;

-- Rewrite update policy to preserve protected fields but allow display_name + status changes
DROP POLICY IF EXISTS profiles_update_self ON public.profiles;
CREATE POLICY profiles_update_self ON public.profiles
FOR UPDATE TO authenticated
USING (auth.uid() = id)
WITH CHECK (
  auth.uid() = id
  AND username        = (SELECT p.username        FROM public.profiles p WHERE p.id = auth.uid())
  AND xp              = (SELECT p.xp              FROM public.profiles p WHERE p.id = auth.uid())
  AND current_streak  = (SELECT p.current_streak  FROM public.profiles p WHERE p.id = auth.uid())
  AND longest_streak  = (SELECT p.longest_streak  FROM public.profiles p WHERE p.id = auth.uid())
  AND last_focus_date IS NOT DISTINCT FROM (SELECT p.last_focus_date FROM public.profiles p WHERE p.id = auth.uid())
);

-- Notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  title text NOT NULL,
  body text,
  type text NOT NULL DEFAULT 'info',
  link text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_id_created_idx
  ON public.notifications (user_id, created_at DESC);

GRANT SELECT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY notifications_select_own ON public.notifications
FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY notifications_update_own ON public.notifications
FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY notifications_delete_own ON public.notifications
FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Enable realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- Trigger: notify host on new bonk join request
CREATE OR REPLACE FUNCTION public.notify_host_on_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_host uuid;
  v_name text;
  v_requester text;
BEGIN
  SELECT host_id, name INTO v_host, v_name FROM public.bonks WHERE id = NEW.bonk_id;
  SELECT display_name INTO v_requester FROM public.profiles WHERE id = NEW.user_id;
  IF v_host IS NOT NULL AND v_host <> NEW.user_id THEN
    INSERT INTO public.notifications (user_id, title, body, type, link)
    VALUES (
      v_host,
      'New join request',
      COALESCE(v_requester,'Someone') || ' wants to join "' || COALESCE(v_name,'your bonk') || '"',
      'bonk_request',
      '/bonks/' || NEW.bonk_id
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bonk_requests_notify_host ON public.bonk_requests;
CREATE TRIGGER bonk_requests_notify_host
AFTER INSERT ON public.bonk_requests
FOR EACH ROW EXECUTE FUNCTION public.notify_host_on_request();
