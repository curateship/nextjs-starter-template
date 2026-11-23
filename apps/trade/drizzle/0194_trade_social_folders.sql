-- Folders of creators, for the social feed's left panel, plus the index the
-- feed itself stands on.
--
-- The two tables copy the shape of "trade_market_folders" with a different
-- subject: member-owned named lists with a position and a hidden flag. A
-- creator may sit in several folders, which is why the join table exists
-- instead of a folder column on the creator.
--
-- Nothing existing is changed or dropped.

CREATE TABLE IF NOT EXISTS "trade_social_folders" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "name" varchar(80) NOT NULL,
  "position" integer NOT NULL DEFAULT 0,
  -- Switched off with the eye in the manage window. The folder keeps its
  -- creators and stops taking a row in the panel.
  "hidden" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
-- Case-folded: "Trusted" and "trusted" are one folder to a person.
CREATE UNIQUE INDEX IF NOT EXISTS "trade_social_folders_name_idx"
  ON "trade_social_folders" ("user_id", lower("name"));
CREATE INDEX IF NOT EXISTS "trade_social_folders_position_idx"
  ON "trade_social_folders" ("user_id", "position");

CREATE TABLE IF NOT EXISTS "trade_social_folder_creators" (
  "folder_id" varchar(36) NOT NULL
    REFERENCES "trade_social_folders" ("id") ON DELETE CASCADE,
  "creator_id" varchar(36) NOT NULL
    REFERENCES "trade_social_creators" ("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("folder_id", "creator_id")
);
-- Removing a creator has to find their folder rows without walking folders.
CREATE INDEX IF NOT EXISTS "trade_social_folder_creators_creator_idx"
  ON "trade_social_folder_creators" ("creator_id");

-- The feed reads one member's posts across every creator, newest first. The
-- two indexes that exist lead with the creator, so this page had no index to
-- stand on.
CREATE INDEX IF NOT EXISTS "trade_social_posts_feed_idx"
  ON "trade_social_posts" ("user_id", "posted_at");
