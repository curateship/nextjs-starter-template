-- Pick your chime (old task 34): the sound for a focus ending and the sound
-- for a break ending, chosen separately. Both start on the original two-tone
-- chime, so nobody hears anything different until they choose. The ids are
-- the ones in src/lib/pomodoro/chimes.ts; an unknown one reads as two-tone.
ALTER TABLE "user_preferences"
  ADD COLUMN IF NOT EXISTS "focus_chime" varchar(30) NOT NULL DEFAULT 'two-tone',
  ADD COLUMN IF NOT EXISTS "break_chime" varchar(30) NOT NULL DEFAULT 'two-tone';
