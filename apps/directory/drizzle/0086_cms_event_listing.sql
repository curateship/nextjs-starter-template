-- An event's place can be one of the site's own listings.
--
-- `listing_id` points at the listing. While it does, the event page shows the
-- listing's current name and address and links to it. `place_name` and
-- `place_address` keep the last name and address as plain text, so when the
-- listing is deleted the link goes and the event still says where it is.
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "listing_id" varchar(36);

ALTER TABLE "events" DROP CONSTRAINT IF EXISTS "events_listing_id_fkey";
ALTER TABLE "events" ADD CONSTRAINT "events_listing_id_fkey"
  FOREIGN KEY ("listing_id") REFERENCES "directory_listings"("id")
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "ix_events_listing" ON "events" ("listing_id");
