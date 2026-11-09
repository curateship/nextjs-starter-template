-- The Bots dashboard at /bots (Tyler, 9 Nov 2026: "combine the automation,
-- backtest and bot dashboard into one 3 panel dashboard like in shell").
-- Only additions, so the release before keeps working until this one is live.
--
-- The left page is one per person, as the Trade dashboard's is, and starts
-- fresh: the Dashboards block (Overview, Recipes, Backtests, Bots) and an
-- empty line. No row means the page was never written, and the app shows the
-- starting page. A locked page reads only, and the server refuses a save.
CREATE TABLE IF NOT EXISTS "trade_bots_pages" (
  "user_id" varchar(36) PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "body" text NOT NULL DEFAULT '',
  "locked" boolean NOT NULL DEFAULT false,
  "cover_url" text,
  "cover_images" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- The Bots Overview's widgets in the shell's rows, one layout per person, kept
-- apart from the Trade Overview's so moving one never moves the other. Null
-- until the first change, which reads as the starting layout (Running bots).
ALTER TABLE "trade_prefs" ADD COLUMN IF NOT EXISTS "bots_widgets" jsonb;
