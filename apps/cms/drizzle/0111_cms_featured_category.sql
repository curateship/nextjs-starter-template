-- A featured spot in one category.
--
-- A featured plan may now name one category. A plan with no category sells
-- the whole directory, exactly as every plan did before this file, so every
-- saved plan keeps working untouched.
--
-- `category_spots` is how many spots that category sells at once, and it only
-- means anything on a plan that names a category. Checkouts and placements
-- carry the category they were bought for, because a plan's category can be
-- edited later and a sale has to remember what it actually bought.
--
-- There is no foreign key on any of the three `category_id` columns, on
-- purpose. CASCADE would try to delete a plan that a paid placement still
-- points at, and the placement's own RESTRICT would then refuse the whole
-- category delete with a raw database error. SET NULL is worse: a Bakeries
-- plan would silently become a whole-directory plan at the bakery price. So
-- the id is kept as it is, the server treats a plan whose category has gone
-- as one nobody can buy, and the admin's table says so.

ALTER TABLE "directory_featured_plans"
  ADD COLUMN IF NOT EXISTS "category_id" varchar(36);

ALTER TABLE "directory_featured_plans"
  ADD COLUMN IF NOT EXISTS "category_spots" integer;

-- Either a whole-directory plan with neither field, or a listing plan with
-- both. An event's spot is the top of the Events page, which has no
-- categories, so an event plan can never name one.
ALTER TABLE "directory_featured_plans"
  ADD CONSTRAINT "directory_featured_plans_category_check"
    CHECK (
      ("category_id" IS NULL AND "category_spots" IS NULL)
      OR (
        "kind" = 'listing'
        AND "category_id" IS NOT NULL
        -- Said out loud rather than left to BETWEEN. A null here would make
        -- the whole expression null, and a CHECK passes on null, so without
        -- this line a plan could name a category and sell no spots at all.
        AND "category_spots" IS NOT NULL
        AND "category_spots" BETWEEN 1 AND 100
      )
    );

CREATE INDEX IF NOT EXISTS "ix_directory_featured_plans_category"
  ON "directory_featured_plans" ("workspace_id", "category_id");

-- What an open checkout is holding a spot in. Counted towards the category's
-- limit while it is young enough for Stripe to still take the payment.
ALTER TABLE "directory_featured_checkouts"
  ADD COLUMN IF NOT EXISTS "category_id" varchar(36);

ALTER TABLE "directory_featured_checkouts"
  ADD CONSTRAINT "directory_featured_checkouts_category_check"
    CHECK ("category_id" IS NULL OR "listing_id" IS NOT NULL);

CREATE INDEX IF NOT EXISTS "ix_directory_featured_checkouts_category"
  ON "directory_featured_checkouts" ("workspace_id", "category_id", "created_at");

-- What a paid spot was bought for. Null is the whole directory.
ALTER TABLE "directory_featured_entitlements"
  ADD COLUMN IF NOT EXISTS "category_id" varchar(36);

ALTER TABLE "directory_featured_entitlements"
  ADD CONSTRAINT "directory_featured_entitlements_category_check"
    CHECK ("category_id" IS NULL OR "listing_id" IS NOT NULL);

CREATE INDEX IF NOT EXISTS "ix_directory_featured_entitlements_category_active"
  ON "directory_featured_entitlements"
    ("workspace_id", "category_id", "status", "ends_at");
