-- Swiping schedule (part 2 of "features/02-swiping-and-scoring"): who
-- started the loop, the window the schedule last started or Stop held, and
-- when a limit allows the loop again. A Super Like (part 3) is stored as the
-- swipe "super" in the existing varchar(10) column and needs no change.
--
-- Additions only. Nothing stored is renamed or dropped.

ALTER TABLE "date_phones"
  ADD COLUMN IF NOT EXISTS "started_by" varchar(10),
  ADD COLUMN IF NOT EXISTS "schedule_day" varchar(10) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "resume_at" timestamptz;
