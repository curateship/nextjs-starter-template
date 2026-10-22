-- Pause hides you on Facebook (part 22 of "facebook/01-facebook-dating"):
-- whether Facebook Dating's own break was last read back on (true) or off
-- (false), null before the phone ever read it, and when.
--
-- Additions only. Nothing stored is renamed or dropped.

ALTER TABLE "date_accounts"
  ADD COLUMN IF NOT EXISTS "app_break" boolean,
  ADD COLUMN IF NOT EXISTS "app_break_at" timestamptz;
