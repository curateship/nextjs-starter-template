-- Checkout reservations only exist while payment is unresolved. Keeping the
-- listing reference prevents an admin delete from removing the evidence needed
-- to recover or confirm a Stripe payment.

DELETE FROM "directory_featured_checkouts"
WHERE "status" <> 'pending';

DROP INDEX "ux_directory_featured_checkouts_pending_listing";
ALTER TABLE "directory_featured_checkouts"
  DROP CONSTRAINT "directory_featured_checkouts_status_check";
ALTER TABLE "directory_featured_checkouts"
  DROP COLUMN "status";

ALTER TABLE "directory_featured_checkouts"
  DROP CONSTRAINT "directory_featured_checkouts_listing_id_fkey";
ALTER TABLE "directory_featured_checkouts"
  ADD CONSTRAINT "directory_featured_checkouts_listing_id_fkey"
  FOREIGN KEY ("listing_id") REFERENCES "directory_listings"("id")
  ON DELETE RESTRICT;

CREATE UNIQUE INDEX "ux_directory_featured_checkouts_listing"
  ON "directory_featured_checkouts" ("workspace_id", "listing_id");
