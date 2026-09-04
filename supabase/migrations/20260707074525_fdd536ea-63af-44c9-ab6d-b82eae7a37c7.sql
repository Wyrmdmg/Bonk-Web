-- Progression columns on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS xp integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_streak integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS longest_streak integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_focus_date date;

-- Food pantry: rows the server awards; owners can rename their own.
CREATE TABLE IF NOT EXISTS public.user_foods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  food_key text NOT NULL,
  custom_name text,
  obtained_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.user_foods TO anon, authenticated;
GRANT UPDATE (custom_name) ON public.user_foods TO authenticated;
GRANT ALL ON public.user_foods TO service_role;
ALTER TABLE public.user_foods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_foods_read_all" ON public.user_foods FOR SELECT USING (true);
CREATE POLICY "user_foods_rename_own" ON public.user_foods
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS user_foods_user_idx ON public.user_foods(user_id);