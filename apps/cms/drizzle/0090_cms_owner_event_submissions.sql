-- Events a listing's owner sends from My listings, in the same queue as the
-- public's suggestions from the Suggest an event page.
--
-- `from_owner` marks the row. `owner_user_id` is the account that sent it,
-- which is how My listings shows an owner their own events and nobody
-- else's. `listing_id` is the owner's listing, which is always the place: an
-- owner cannot send an event for anywhere else. Approving an owner's event
-- publishes it with the listing as its place.
--
-- `cover_image` is a Media library address. An owner has an account, so their
-- photo goes through the Media library like any other, not through the
-- held-aside `photo_path` a public suggestion uses.
ALTER TABLE "event_submissions"
  ADD COLUMN IF NOT EXISTS "from_owner" boolean NOT NULL DEFAULT false;
ALTER TABLE "event_submissions"
  ADD COLUMN IF NOT EXISTS "owner_user_id" varchar(36)
    REFERENCES "users"("id") ON DELETE SET NULL;
ALTER TABLE "event_submissions"
  ADD COLUMN IF NOT EXISTS "listing_id" varchar(36)
    REFERENCES "directory_listings"("id") ON DELETE SET NULL;
ALTER TABLE "event_submissions"
  ADD COLUMN IF NOT EXISTS "cover_image" varchar(600) NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS "ix_event_submissions_owner"
  ON "event_submissions" ("owner_user_id", "listing_id", "created_at");
