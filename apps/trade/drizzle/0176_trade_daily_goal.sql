-- The daily goal: how much this account is trying to make in a day, written
-- either as a percent of what every wallet is worth or as a fixed amount of
-- money. Read through `readGoal`, so a NULL is the goal switched off.

ALTER TABLE "trade_prefs" ADD COLUMN IF NOT EXISTS "goal" jsonb;
