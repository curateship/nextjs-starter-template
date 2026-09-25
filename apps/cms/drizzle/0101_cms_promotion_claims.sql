-- Claiming a deal: a visitor gives a name and an email and gets their own
-- short code, shown once on the page and sent by email. A deal can be for
-- the first so many people, and then it says "All claimed".
--
-- An owner or an admin switches claims on. An owner's switch is part of the
-- deal they send, so it waits for review like the rest of it.

ALTER TABLE "promotions"
  ADD COLUMN IF NOT EXISTS "takes_claims" boolean NOT NULL DEFAULT false,
  -- Null for no limit.
  ADD COLUMN IF NOT EXISTS "claim_limit" integer;

ALTER TABLE "promotions"
  DROP CONSTRAINT IF EXISTS "promotions_claim_limit_check",
  ADD CONSTRAINT "promotions_claim_limit_check"
    CHECK ("claim_limit" IS NULL OR "claim_limit" BETWEEN 1 AND 100000);

ALTER TABLE "promotion_requests"
  ADD COLUMN IF NOT EXISTS "takes_claims" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "claim_limit" integer;

-- One row per claim. Removing someone marks the row cancelled rather than
-- deleting it, which frees their place and keeps the record. Deleting the
-- deal deletes its claims.
CREATE TABLE IF NOT EXISTS "promotion_claims" (
  "id" varchar(36) PRIMARY KEY,
  "workspace_id" varchar(36) NOT NULL
    REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "promotion_id" varchar(36) NOT NULL
    REFERENCES "promotions"("id") ON DELETE CASCADE,
  "name" varchar(120) NOT NULL,
  -- Stored in lower case, so one person is one email.
  "email" varchar(255) NOT NULL,
  -- The claimer's own code, like "K7QX-P2MD", unique within the deal, so a
  -- later task can mark each one used at the counter.
  "code" varchar(20) NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'claimed',
  "created_at" timestamptz NOT NULL,
  "cancelled_at" timestamptz,
  CONSTRAINT "promotion_claims_status_check"
    CHECK ("status" IN ('claimed', 'cancelled')),
  CONSTRAINT "promotion_claims_cancelled_check"
    CHECK (("status" = 'cancelled') = ("cancelled_at" IS NOT NULL))
);

-- One live claim per email per deal.
CREATE UNIQUE INDEX IF NOT EXISTS "ux_promotion_claims_live_email"
  ON "promotion_claims" ("promotion_id", "email")
  WHERE "status" = 'claimed';

CREATE UNIQUE INDEX IF NOT EXISTS "ux_promotion_claims_code"
  ON "promotion_claims" ("promotion_id", "code");

CREATE INDEX IF NOT EXISTS "ix_promotion_claims_promotion"
  ON "promotion_claims" ("promotion_id", "status", "created_at");
