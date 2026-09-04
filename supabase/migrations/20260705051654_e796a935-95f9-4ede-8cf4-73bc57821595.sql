CREATE TABLE public.todos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  text text NOT NULL CHECK (char_length(text) BETWEEN 1 AND 200),
  done boolean NOT NULL DEFAULT false,
  is_public boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX todos_user_idx ON public.todos(user_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.todos TO authenticated;
GRANT SELECT ON public.todos TO anon;
GRANT ALL ON public.todos TO service_role;
ALTER TABLE public.todos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own todos" ON public.todos FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Anyone reads public todos" ON public.todos FOR SELECT USING (is_public = true);
CREATE POLICY "Users insert own todos" ON public.todos FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own todos" ON public.todos FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own todos" ON public.todos FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_todos_updated_at BEFORE UPDATE ON public.todos
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();