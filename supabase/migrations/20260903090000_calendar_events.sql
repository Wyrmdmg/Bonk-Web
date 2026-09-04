-- The calendar's events, which used to live in localStorage.
--
-- A calendar that only exists in one browser is a scratchpad. Signing in on a
-- laptop has to show the same month you filled in on a phone, so the rows move
-- to the database and the app now asks you to sign in before it opens.
--
-- Times are a date plus "HH:MM" rather than a timestamptz on purpose: an event
-- at 09:00 means nine in the morning wherever you open it. Storing an instant
-- would quietly move every entry the first time a timezone changed.
CREATE TABLE IF NOT EXISTS public.calendar_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day date NOT NULL,
  at text NOT NULL DEFAULT '09:00' CHECK (at ~ '^[0-2][0-9]:[0-5][0-9]$'),
  mins integer NOT NULL DEFAULT 60 CHECK (mins BETWEEN 5 AND 1440),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 80),
  note text CHECK (note IS NULL OR char_length(note) <= 500),
  tone smallint NOT NULL DEFAULT 0 CHECK (tone BETWEEN 0 AND 4),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS calendar_events_user_day_idx ON public.calendar_events(user_id, day);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_events TO authenticated;
GRANT ALL ON public.calendar_events TO service_role;
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own events" ON public.calendar_events;
DROP POLICY IF EXISTS "Users insert own events" ON public.calendar_events;
DROP POLICY IF EXISTS "Users update own events" ON public.calendar_events;
DROP POLICY IF EXISTS "Users delete own events" ON public.calendar_events;
CREATE POLICY "Users read own events" ON public.calendar_events
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own events" ON public.calendar_events
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own events" ON public.calendar_events
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own events" ON public.calendar_events
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- PostgREST answers from a cached copy of the schema, so without this the API
-- keeps reporting the table as missing for a minute after it exists.
NOTIFY pgrst, 'reload schema';
