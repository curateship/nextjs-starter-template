-- Timer across devices (old task 32): every open page asks every few seconds
-- for the account's running or paused session, so that read gets an index of
-- its own. Partial, because an account has at most one such row and every
-- finished session would only make a full index bigger.
CREATE INDEX IF NOT EXISTS "focus_sessions_user_active_idx"
  ON "focus_sessions" ("user_id")
  WHERE "status" IN ('running', 'paused');
