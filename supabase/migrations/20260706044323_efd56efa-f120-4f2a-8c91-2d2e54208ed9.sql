ALTER TABLE public.todos REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.todos;