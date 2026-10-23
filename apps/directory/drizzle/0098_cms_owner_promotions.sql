-- Listing owners post deals, change them and end them early, from My listings.
--
-- Every owner deal and every owner change waits in `promotion_requests` until
-- an admin reads it. A request holds the whole deal as the owner wrote it, so
-- a change can be shown beside the live deal and swapped in on approval.
-- "End now" is the one thing that does not wait: it sets `ended_at`.

-- The owner who sent the deal, set when an admin approves it. Only this
-- account can change it or end it, and a new owner of the listing sees none of
-- the old owner's deals.
ALTER TABLE "promotions"
  ADD COLUMN IF NOT EXISTS "owner_user_id" varchar(36)
    REFERENCES "users"("id") ON DELETE SET NULL,
  -- Set by "End now". An ended deal leaves every public list at once, its page
  -- says "This deal has ended", and an admin can undo it.
  ADD COLUMN IF NOT EXISTS "ended_at" timestamptz;

CREATE INDEX IF NOT EXISTS "ix_promotions_owner"
  ON "promotions" ("owner_user_id");

CREATE TABLE IF NOT EXISTS "promotion_requests" (
  "id" varchar(36) PRIMARY KEY,
  "workspace_id" varchar(36) NOT NULL
    REFERENCES "workspaces"("id") ON DELETE CASCADE,
  -- The owner's listing, from their approved claim, never from the form.
  -- Deleting the listing deletes its deals, so its requests go too.
  "listing_id" varchar(36) NOT NULL
    REFERENCES "directory_listings"("id") ON DELETE CASCADE,
  "owner_user_id" varchar(36)
    REFERENCES "users"("id") ON DELETE SET NULL,
  -- 'new' for a deal the owner wants added, 'change' for new wording of one
  -- of their live deals.
  "kind" varchar(10) NOT NULL,
  -- A change: the deal it changes. A new deal: the deal approving it made.
  -- Emptied if an admin deletes that deal, so the record stays.
  "promotion_id" varchar(36)
    REFERENCES "promotions"("id") ON DELETE SET NULL,
  -- 'pending', 'approved' or 'rejected'.
  "status" varchar(20) NOT NULL DEFAULT 'pending',
  -- The deal as the owner wrote it, the same columns as `promotions`.
  "title" varchar(200) NOT NULL,
  "description" varchar(2000) NOT NULL DEFAULT '',
  "cover_image" varchar(600) NOT NULL DEFAULT '',
  "start_date" date NOT NULL,
  "end_date" date,
  "code" varchar(40) NOT NULL DEFAULT '',
  "small_print" varchar(1000) NOT NULL DEFAULT '',
  "deal_type" varchar(20) NOT NULL,
  "amount" numeric(7, 2),
  "headline" varchar(24) NOT NULL,
  "times" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "review_note" varchar(500) NOT NULL DEFAULT '',
  "reviewed_by_user_id" varchar(36)
    REFERENCES "users"("id") ON DELETE SET NULL,
  "reviewed_at" timestamptz,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  CONSTRAINT "promotion_requests_kind_check"
    CHECK ("kind" IN ('new', 'change')),
  CONSTRAINT "promotion_requests_status_check"
    CHECK ("status" IN ('pending', 'approved', 'rejected')),
  CONSTRAINT "promotion_requests_end_after_start_check"
    CHECK ("end_date" IS NULL OR "end_date" >= "start_date")
);

-- The admin's queue, by tab and newest first.
CREATE INDEX IF NOT EXISTS "ix_promotion_requests_workspace_status"
  ON "promotion_requests" ("workspace_id", "status", "created_at");

-- My listings reads one account's requests.
CREATE INDEX IF NOT EXISTS "ix_promotion_requests_owner"
  ON "promotion_requests" ("owner_user_id", "created_at");

-- At most one change waiting per deal.
CREATE UNIQUE INDEX IF NOT EXISTS "ux_promotion_requests_one_pending_change"
  ON "promotion_requests" ("promotion_id")
  WHERE "kind" = 'change' AND "status" = 'pending';
