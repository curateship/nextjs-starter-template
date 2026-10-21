-- Dismiss on the AI's draft (task "features/05-dashboard-layout", Tyler's
-- mock of 20 Oct 2026): which message the member dismissed the draft for, so
-- the background pass does not write another for the same message. A newer
-- message moves on from it. "opener" stands for a first message with nothing
-- in the chat yet.
--
-- Additions only. Nothing stored is renamed or dropped.

ALTER TABLE "date_matches"
  ADD COLUMN IF NOT EXISTS "draft_dismissed_for" varchar(36);
