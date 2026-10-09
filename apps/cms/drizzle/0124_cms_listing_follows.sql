-- Following a listing for its deals.
--
-- A signed-in person follows a listing, and gets an email when it publishes a
-- new deal. The email address is the account's own, read when the email goes,
-- so it is never copied here and never goes stale.
--
-- At most one email per listing per day for each follower, naming every new
-- deal. `told_through` is the moment up to which this follower has heard about
-- the listing's deals: it starts at the moment they followed, so deals from
-- before are never sent, and moves forward each time an email goes.
-- `last_mailed_day` is the site's own calendar day of the last email.
-- `claimed_at` is held by the background pass while it sends, so two passes
-- never send the same email; a claim older than ten minutes is a send that
-- failed, and the next pass tries again.

CREATE TABLE IF NOT EXISTS "listing_follows" (
  "id" varchar(36) PRIMARY KEY,
  "workspace_id" varchar(36) NOT NULL
    REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "listing_id" varchar(36) NOT NULL
    REFERENCES "directory_listings"("id") ON DELETE CASCADE,
  "user_id" varchar(36) NOT NULL
    REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" timestamptz NOT NULL,
  "told_through" timestamptz NOT NULL,
  "last_mailed_day" date,
  "claimed_at" timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS "ux_listing_follows_listing_user"
  ON "listing_follows" ("listing_id", "user_id");

CREATE INDEX IF NOT EXISTS "ix_listing_follows_workspace_listing"
  ON "listing_follows" ("workspace_id", "listing_id");
