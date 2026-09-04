CREATE UNIQUE INDEX IF NOT EXISTS focus_sessions_one_bonk_reward_per_cycle
ON public.focus_sessions (user_id, bonk_id, started_at)
WHERE kind = 'bonk' AND bonk_id IS NOT NULL;