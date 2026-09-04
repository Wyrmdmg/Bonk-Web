-- public.email_queue_dispatch() and public.email_queue_wake() were created
-- outside version control (dashboard / pg_cron wiring) in an earlier version
-- of this project. Later migrations REVOKE/GRANT on them, so they must exist.
--
-- The email pipeline that used them has been removed from this app, so define
-- them as inert no-op stubs, just enough for the GRANT/REVOKE statements to succeed.
CREATE OR REPLACE FUNCTION public.email_queue_dispatch()
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$ BEGIN END; $$;

CREATE OR REPLACE FUNCTION public.email_queue_wake()
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$ BEGIN END; $$;
