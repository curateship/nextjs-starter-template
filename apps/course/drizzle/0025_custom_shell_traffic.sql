-- The traffic tracker: who visits, what they read, where they came from, and
-- whether they're on a phone — without an outside analytics service and
-- without the database filling up.
--
-- Two kinds of table. The daily counters (traffic_daily_totals and
-- traffic_daily_facts) are tiny and kept forever — a year of traffic is a few
-- thousand rows. Everything else is scaffolding that gets swept: individual
-- visit rows live 7 days, and the visitor-hash and salt rows only live until
-- their day ends, because each day's unique-visitor count is frozen into the
-- totals row as it happens. Deleting the salt is what makes old hashes
-- unrecoverable — no raw IP is ever stored anywhere.
--
-- Pollution caps live in the write path (src/server/traffic.ts): query
-- strings stripped, paths capped at 160 characters, and at most 200 distinct
-- paths / 100 referrer sites per day, with the overflow lumped into an
-- '(other)' bucket so a bot spraying random URLs cannot grow the table.

CREATE TABLE IF NOT EXISTS "traffic_daily_totals" (
  "day" date PRIMARY KEY,
  "views" integer NOT NULL DEFAULT 0,
  "member_views" integer NOT NULL DEFAULT 0,
  "visitor_views" integer NOT NULL DEFAULT 0,
  "unique_visitors" integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS "traffic_daily_facts" (
  "day" date NOT NULL,
  "dimension" varchar(20) NOT NULL,
  "key" varchar(160) NOT NULL,
  "views" integer NOT NULL DEFAULT 0,
  CONSTRAINT "traffic_daily_facts_pk" PRIMARY KEY ("day", "dimension", "key"),
  CONSTRAINT "traffic_daily_facts_dimension_check"
    CHECK ("dimension" in ('path', 'referrer', 'device'))
);

-- The 7-day log of individual visits. Deliberately no user id, no IP, no user
-- agent and no visitor hash on the row — nothing here can be tied back to a
-- person once the day's salt is gone.
CREATE TABLE IF NOT EXISTS "traffic_visits" (
  "id" varchar(36) PRIMARY KEY,
  "occurred_at" timestamp with time zone NOT NULL,
  "path" varchar(160) NOT NULL,
  "referrer_domain" varchar(100) NOT NULL,
  "device" varchar(10) NOT NULL,
  "audience" varchar(10) NOT NULL,
  CONSTRAINT "traffic_visits_device_check"
    CHECK ("device" in ('phone', 'tablet', 'computer')),
  CONSTRAINT "traffic_visits_audience_check"
    CHECK ("audience" in ('member', 'visitor'))
);

CREATE INDEX IF NOT EXISTS "ix_traffic_visits_occurred_at"
  ON "traffic_visits" ("occurred_at");

-- One row per visitor hash per day; insert-on-conflict-do-nothing is the
-- unique-visitor dedup. Swept once the day has passed.
CREATE TABLE IF NOT EXISTS "traffic_visitors" (
  "day" date NOT NULL,
  "visitor_hash" varchar(64) NOT NULL,
  CONSTRAINT "traffic_visitors_pk" PRIMARY KEY ("day", "visitor_hash")
);

-- The random ingredient in each day's visitor hashes. Swept with the day.
CREATE TABLE IF NOT EXISTS "traffic_day_salts" (
  "day" date PRIMARY KEY,
  "salt" varchar(64) NOT NULL
);
