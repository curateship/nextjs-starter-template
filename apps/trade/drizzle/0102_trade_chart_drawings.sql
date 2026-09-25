-- Trade's own migrations number from 0100 — see 0100_trade_market_favorites.
--
-- The lines drawn on a chart, one row each, tied to the market they were drawn
-- on. The key is the person and the drawing together, so a save keyed on it
-- can never reach a row belonging to somebody else.
CREATE TABLE IF NOT EXISTS "trade_chart_drawings" (
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "id" varchar(36) NOT NULL,
  "market_key" varchar(120) NOT NULL,
  "shape" jsonb NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("user_id", "id")
);

CREATE INDEX IF NOT EXISTS "trade_chart_drawings_market_idx"
  ON "trade_chart_drawings" ("user_id", "market_key");
