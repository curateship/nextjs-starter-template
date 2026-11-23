-- Every error and warning the trading engine prints, kept with its time.
--
-- Until now the only one a person could reach was the very last, carried on
-- the heartbeat as one string with no date. Two failures at 3am and one at 4am
-- left the screen showing the 4am one and nothing else, which is why the
-- hourly crash in August took days to place.
--
-- Repeats of one line from one place fold into a single row with a count, and
-- the table is trimmed to its newest 500 rows whenever a new one is inserted.
CREATE TABLE IF NOT EXISTS "trade_engine_errors" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "kind" varchar(10) NOT NULL,
  "source" varchar(60) NOT NULL,
  "message" text NOT NULL,
  "times" integer DEFAULT 1 NOT NULL,
  "first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "trade_engine_errors_kind_check"
    CHECK ("kind" IN ('error', 'warning')),
  CONSTRAINT "trade_engine_errors_times_check" CHECK ("times" >= 1)
);

-- Newest first is the only order the screen ever asks for, and the trim walks
-- the same order backwards.
CREATE INDEX IF NOT EXISTS "trade_engine_errors_seen_idx"
  ON "trade_engine_errors" ("last_seen_at" DESC);

-- What the fold looks a row up by before every insert.
CREATE INDEX IF NOT EXISTS "trade_engine_errors_fold_idx"
  ON "trade_engine_errors" ("source", "kind", "first_seen_at" DESC);
