CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Unschedule previous version if it exists so this migration is idempotent.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto-end-stale-bonks') THEN
    PERFORM cron.unschedule('auto-end-stale-bonks');
  END IF;
END $$;

SELECT cron.schedule(
  'auto-end-stale-bonks',
  '*/5 * * * *',
  $$
  UPDATE public.bonks
     SET status = 'ended',
         ended_at = now()
   WHERE status = 'active'
     AND created_at < now() - INTERVAL '1 hour';
  $$
);