
-- === Profiles ===
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL UNIQUE,
  display_name text NOT NULL,
  email text,
  recovery_code_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT username_format CHECK (username ~ '^[a-z0-9_]{3,20}$'),
  CONSTRAINT display_name_len CHECK (char_length(display_name) BETWEEN 2 AND 24)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT ON public.profiles TO anon;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_read_all" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "profiles_update_self" ON public.profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- === Deleted email/username cooldown ===
CREATE TABLE public.deleted_emails (
  email text PRIMARY KEY,
  deleted_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.deleted_emails TO service_role;
ALTER TABLE public.deleted_emails ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.deleted_usernames (
  username text PRIMARY KEY,
  deleted_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.deleted_usernames TO service_role;
ALTER TABLE public.deleted_usernames ENABLE ROW LEVEL SECURITY;

-- === Profanity blocklist ===
CREATE TABLE public.blocked_words (
  word text PRIMARY KEY
);
GRANT SELECT ON public.blocked_words TO authenticated, anon;
GRANT ALL ON public.blocked_words TO service_role;
ALTER TABLE public.blocked_words ENABLE ROW LEVEL SECURITY;
CREATE POLICY "blocked_words_read" ON public.blocked_words FOR SELECT USING (true);

INSERT INTO public.blocked_words (word) VALUES
  ('fuck'),('shit'),('bitch'),('cunt'),('nigger'),('nigga'),('faggot'),('fag'),
  ('retard'),('rape'),('slut'),('whore'),('pedo'),('pedophile'),('kike'),('spic'),
  ('chink'),('tranny'),('dyke'),('kill'),('nazi'),('hitler'),('admin'),('mod'),
  ('moderator'),('support'),('system'),('official'),('wyrmdmg')
ON CONFLICT DO NOTHING;

-- === Bonks ===
CREATE TABLE public.bonks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  password_hash text,
  join_mode text NOT NULL DEFAULT 'open' CHECK (join_mode IN ('open','password','request')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','ended')),
  timer_type text NOT NULL DEFAULT 'pomodoro',
  focus_min int NOT NULL DEFAULT 25,
  break_min int NOT NULL DEFAULT 5,
  target_cycles int NOT NULL DEFAULT 4,
  current_cycle int NOT NULL DEFAULT 1,
  cycle_state text NOT NULL DEFAULT 'idle' CHECK (cycle_state IN ('idle','focus','break')),
  cycle_started_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);
CREATE INDEX bonks_status_idx ON public.bonks(status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bonks TO authenticated;
GRANT SELECT ON public.bonks TO anon;
GRANT ALL ON public.bonks TO service_role;
ALTER TABLE public.bonks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bonks_read" ON public.bonks FOR SELECT USING (true);
CREATE POLICY "bonks_insert_self" ON public.bonks FOR INSERT WITH CHECK (auth.uid() = host_id);
CREATE POLICY "bonks_update_host" ON public.bonks FOR UPDATE USING (auth.uid() = host_id);

-- === Members ===
CREATE TABLE public.bonk_members (
  bonk_id uuid NOT NULL REFERENCES public.bonks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (bonk_id, user_id)
);
CREATE INDEX bonk_members_bonk_idx ON public.bonk_members(bonk_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bonk_members TO authenticated;
GRANT SELECT ON public.bonk_members TO anon;
GRANT ALL ON public.bonk_members TO service_role;
ALTER TABLE public.bonk_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bonk_members_read" ON public.bonk_members FOR SELECT USING (true);
-- Insert/delete handled via server fns using service role
CREATE POLICY "bonk_members_delete_self" ON public.bonk_members FOR DELETE USING (auth.uid() = user_id);

-- === Join requests ===
CREATE TABLE public.bonk_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bonk_id uuid NOT NULL REFERENCES public.bonks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bonk_id, user_id)
);
CREATE INDEX bonk_requests_bonk_idx ON public.bonk_requests(bonk_id, status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bonk_requests TO authenticated;
GRANT ALL ON public.bonk_requests TO service_role;
ALTER TABLE public.bonk_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bonk_requests_read_self_or_host" ON public.bonk_requests FOR SELECT USING (
  auth.uid() = user_id OR auth.uid() = (SELECT host_id FROM public.bonks WHERE id = bonk_id)
);

-- === Leave cooldown ===
CREATE TABLE public.leave_cooldowns (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  until timestamptz NOT NULL
);
GRANT SELECT ON public.leave_cooldowns TO authenticated;
GRANT ALL ON public.leave_cooldowns TO service_role;
ALTER TABLE public.leave_cooldowns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cooldown_read_self" ON public.leave_cooldowns FOR SELECT USING (auth.uid() = user_id);

-- === Presence heartbeats (for auto host transfer on unexpected disconnect) ===
CREATE TABLE public.bonk_presence (
  bonk_id uuid NOT NULL REFERENCES public.bonks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_seen timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (bonk_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bonk_presence TO authenticated;
GRANT ALL ON public.bonk_presence TO service_role;
ALTER TABLE public.bonk_presence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "presence_read" ON public.bonk_presence FOR SELECT USING (true);
CREATE POLICY "presence_upsert_self" ON public.bonk_presence FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "presence_update_self" ON public.bonk_presence FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "presence_delete_self" ON public.bonk_presence FOR DELETE USING (auth.uid() = user_id);

-- === Realtime ===
ALTER PUBLICATION supabase_realtime ADD TABLE public.bonks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bonk_members;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bonk_requests;
