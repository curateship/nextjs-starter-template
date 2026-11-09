-- The data the P&L page and Social, the X creator screens, left behind. Both
-- were removed on 9 Nov 2026 (1b9a9c647 and 19bfd62ec), and nothing in the app
-- reads or writes this data any more. Tyler, 9 Nov 2026: drop it in a later
-- release, "do both a and b".
--
-- It waited for its own release because the release before it still read
-- every column of trade_prefs by name, so dropping these two columns while
-- that release served would have broken its reads until the new one took over.
--
-- Gone for good: every saved X creator, their posts, the coins each post named,
-- the times their pages were read, the creator folders, the P&L page's saved
-- AI scores, and each member's stocks switch. No other table points at these.
DROP TABLE IF EXISTS "trade_social_folder_creators";
DROP TABLE IF EXISTS "trade_social_folders";
DROP TABLE IF EXISTS "trade_social_post_coins";
DROP TABLE IF EXISTS "trade_social_reads";
DROP TABLE IF EXISTS "trade_social_posts";
DROP TABLE IF EXISTS "trade_social_creators";
ALTER TABLE "trade_prefs" DROP COLUMN IF EXISTS "pnl_scores";
ALTER TABLE "trade_prefs" DROP COLUMN IF EXISTS "social_match_stocks";
