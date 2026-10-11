-- The Reddit settings that belong to the person rather than to an account,
-- starting with the one number the regular tidy-up reads: how many days a
-- post can go unseen by any search before a skipped one is deleted and an
-- open one loses its stored replies. 0 switches the tidy-up off.
--
-- A person with no row is tidied at the default, 30 days.
--
-- Additions only.
CREATE TABLE IF NOT EXISTS "promo_reddit_settings" (
  "user_id" varchar(36) PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "tidy_after_days" integer NOT NULL DEFAULT 30,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- The tidy-up looks for skipped and open posts by when a search last saw
-- them, oldest first.
CREATE INDEX IF NOT EXISTS "ix_promo_finds_status_seen"
  ON "promo_finds" ("status", "last_seen_at");
