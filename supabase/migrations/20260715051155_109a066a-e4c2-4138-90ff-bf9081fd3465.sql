
-- Revoke EXECUTE from anon/authenticated on internal SECURITY DEFINER helpers.
-- These are called only from Postgres triggers, cron jobs, or trusted server code.
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.email_queue_wake() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.email_queue_dispatch() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_host_on_request() FROM PUBLIC, anon, authenticated;

-- get_equipped_badges is intentionally callable by authenticated users
-- (client reads equipped badges for visible members). Keep it locked out of anon.
REVOKE EXECUTE ON FUNCTION public.get_equipped_badges(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_equipped_badges(uuid[]) TO authenticated;
