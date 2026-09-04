DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto-end-stale-bonks') THEN
    PERFORM cron.unschedule('auto-end-stale-bonks');
  END IF;
END $$;

-- Only end bonks that have had NO presence heartbeat in the last 15 minutes.
-- The previous version ended every active bonk older than 1 hour regardless
-- of whether members were actively using it, closing live rooms on their own.
SELECT cron.schedule(
  'auto-end-stale-bonks',
  '*/5 * * * *',
  $$
  UPDATE public.bonks b
     SET status = 'ended',
         ended_at = now()
   WHERE b.status = 'active'
     AND b.created_at < now() - INTERVAL '5 minutes'
     AND NOT EXISTS (
       SELECT 1 FROM public.bonk_presence p
        WHERE p.bonk_id = b.id
          AND p.last_seen > now() - INTERVAL '15 minutes'
     );
  $$
);