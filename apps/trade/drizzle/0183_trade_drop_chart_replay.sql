-- Takes the chart replay's tables back out.
--
-- Chart replay was built on 22 September 2026 and dropped the same day. Its
-- code is gone from the repo, so nothing reads or writes any of this.
--
-- Why this file is 0183 and not 0181. The two migrations that created these
-- (`0181_trade_chart_replay.sql` and `0182_trade_chart_replay_reshape.sql`)
-- were applied to the live database before the feature was dropped, and they
-- are still recorded in `migration_state`. A file already recorded is never
-- run again, so reusing either number would mean this one silently did
-- nothing on the very database it is for. The gap in the numbering is the
-- honest record of what happened.
--
-- Verified empty before writing this: no rows in either table, and none of the
-- 145 practice journal rows had `replay` set. Nothing is being thrown away.

DROP TABLE IF EXISTS "trade_replay_snapshots";
DROP TABLE IF EXISTS "trade_replays";

ALTER TABLE "trade_paper_journal" DROP COLUMN IF EXISTS "replay";
