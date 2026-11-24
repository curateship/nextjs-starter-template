-- Two listings an admin looked at and said are not the same place, so the
-- Duplicates row on the Listings dashboard stops showing them (Tyler's pick,
-- 24 Nov 2026: "Merge duplicate listings"). The pair is stored once, the
-- smaller id first, and goes when either listing is deleted.
CREATE TABLE IF NOT EXISTS "directory_listing_not_duplicates" (
  "workspace_id" varchar(36) NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "first_listing_id" varchar(36) NOT NULL REFERENCES "directory_listings"("id") ON DELETE CASCADE,
  "second_listing_id" varchar(36) NOT NULL REFERENCES "directory_listings"("id") ON DELETE CASCADE,
  "decided_by_user_id" varchar(36) REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone NOT NULL,
  PRIMARY KEY ("workspace_id", "first_listing_id", "second_listing_id"),
  CONSTRAINT "directory_listing_not_duplicates_order_check" CHECK ("first_listing_id" < "second_listing_id")
);

CREATE INDEX IF NOT EXISTS "ix_directory_listing_not_duplicates_second"
  ON "directory_listing_not_duplicates" ("second_listing_id");
