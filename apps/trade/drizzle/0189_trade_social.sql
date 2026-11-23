-- The social dashboard: one creator's account, the posts held for them, and a
-- line per import.
--
-- Everything here is owned by a member. Two members tracking the same X
-- account get a creator row each and a copy of the posts each, so one
-- member's import can never change what another member sees, and deleting an
-- account takes only that account's copy.
--
-- Nothing existing is changed or dropped.

CREATE TABLE IF NOT EXISTS "trade_social_creators" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "platform" varchar(10) NOT NULL DEFAULT 'x',
  "handle" varchar(40) NOT NULL,
  "display_name" varchar(80),
  "picture" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
-- Case-folded: @CryptoSam and @cryptosam are one account on X.
CREATE UNIQUE INDEX IF NOT EXISTS "trade_social_creators_handle_idx"
  ON "trade_social_creators" ("user_id", "platform", lower("handle"));

CREATE TABLE IF NOT EXISTS "trade_social_posts" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "creator_id" varchar(36) NOT NULL REFERENCES "trade_social_creators" ("id") ON DELETE CASCADE,
  "source_id" varchar(64) NOT NULL,
  "posted_at" timestamp with time zone NOT NULL,
  "text" text NOT NULL,
  "url" text,
  "seen" integer,
  "likes" integer,
  "replies" integer,
  "reposts" integer,
  "reply_to_id" varchar(64),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
-- The rule that makes a second import of the same block an update, not a copy.
CREATE UNIQUE INDEX IF NOT EXISTS "trade_social_posts_source_idx"
  ON "trade_social_posts" ("creator_id", "source_id");
-- The middle panel reads newest first, one creator at a time.
CREATE INDEX IF NOT EXISTS "trade_social_posts_recent_idx"
  ON "trade_social_posts" ("creator_id", "posted_at");

CREATE TABLE IF NOT EXISTS "trade_social_reads" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "creator_id" varchar(36) NOT NULL REFERENCES "trade_social_creators" ("id") ON DELETE CASCADE,
  "reader" varchar(20) NOT NULL,
  "read_at" timestamp with time zone NOT NULL DEFAULT now(),
  "posts" integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS "trade_social_reads_creator_idx"
  ON "trade_social_reads" ("creator_id", "read_at");
