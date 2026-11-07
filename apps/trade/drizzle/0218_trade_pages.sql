-- The pages on a protocol dashboard (the Admin 3 panel design, 7 Nov 2026).
-- The left panel is the exchange's own page of "/" blocks, one per exchange,
-- stored with market_key ''. The right panel is the market's page, one per
-- market. Tyler: "Left panel have blocks editor" and "The right panel now
-- house the market itself detail informations with its own blocks".
--
-- No row means the page was never written, and the app shows the starting
-- page. A locked page reads only, and the server refuses a save.
CREATE TABLE IF NOT EXISTS "trade_pages" (
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "protocol" varchar(20) NOT NULL,
  "market_key" varchar(180) NOT NULL DEFAULT '',
  "body" text NOT NULL DEFAULT '',
  "locked" boolean NOT NULL DEFAULT false,
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("user_id", "protocol", "market_key")
);
