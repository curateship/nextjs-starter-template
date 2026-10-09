-- How many people opened each deal's page, and how many tapped Show code.
--
-- Each person counts once per deal per day for each of the two. That needs the
-- visitor's daily hash for the rest of that day, the same hash the site's own
-- traffic counter keeps (salt + internet address + browser), so it lives in
-- its own table and is thrown away once its day is over. What stays is the
-- day's two numbers.

CREATE TABLE IF NOT EXISTS "promotion_daily_counts" (
  "promotion_id" varchar(36) NOT NULL
    REFERENCES "promotions"("id") ON DELETE CASCADE,
  "day" date NOT NULL,
  "views" integer NOT NULL DEFAULT 0,
  "code_taps" integer NOT NULL DEFAULT 0,
  CONSTRAINT "promotion_daily_counts_pk" PRIMARY KEY ("promotion_id", "day")
);

-- One row per person per deal per day per kind. The key is the whole rule:
-- a second view or a fifth tap that day finds its row already there.
CREATE TABLE IF NOT EXISTS "promotion_count_visitors" (
  "promotion_id" varchar(36) NOT NULL
    REFERENCES "promotions"("id") ON DELETE CASCADE,
  "day" date NOT NULL,
  "kind" varchar(10) NOT NULL,
  "visitor_hash" varchar(64) NOT NULL,
  CONSTRAINT "promotion_count_visitors_pk"
    PRIMARY KEY ("promotion_id", "day", "kind", "visitor_hash"),
  CONSTRAINT "promotion_count_visitors_kind_check"
    CHECK ("kind" IN ('view', 'code'))
);

-- The daily sweep deletes by day.
CREATE INDEX IF NOT EXISTS "ix_promotion_count_visitors_day"
  ON "promotion_count_visitors" ("day");
