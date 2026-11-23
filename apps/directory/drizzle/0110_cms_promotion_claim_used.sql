-- Using a claimed deal at the counter.
--
-- A claim's code is shown at the counter as a QR and as eight characters. The
-- listing's owner or a site admin marks it used, and from then on the code
-- says when it was used, so a screenshot of a used code is worth nothing.
--
-- Two columns, because "used" is a moment and a person: when it happened, and
-- who marked it. The person is kept for the record and goes to null if that
-- account is later deleted, which is why the time is the column everything
-- else reads.

ALTER TABLE "promotion_claims"
  ADD COLUMN IF NOT EXISTS "used_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "used_by_user_id" varchar(36)
    REFERENCES "users"("id") ON DELETE SET NULL;

-- A person without a time would be a half-written record. A time with no
-- person is the normal end state once that account is gone.
ALTER TABLE "promotion_claims"
  DROP CONSTRAINT IF EXISTS "promotion_claims_used_check",
  ADD CONSTRAINT "promotion_claims_used_check"
    CHECK ("used_by_user_id" IS NULL OR "used_at" IS NOT NULL);

-- A used code cannot be taken away. Cancelling frees the place and lets that
-- email claim again, which would hand a second code to somebody who has
-- already had the deal.
ALTER TABLE "promotion_claims"
  DROP CONSTRAINT IF EXISTS "promotion_claims_used_not_cancelled_check",
  ADD CONSTRAINT "promotion_claims_used_not_cancelled_check"
    CHECK (NOT ("status" = 'cancelled' AND "used_at" IS NOT NULL));

-- A code is now unique across the whole site, not just within its deal,
-- because the page that shows it at the counter is found by the code alone:
-- /deals/code/K7QX-P2MD. The deal's address is deliberately not in that link,
-- so an admin renaming the deal's address never breaks a code already emailed
-- or already printed on somebody's screen.
--
-- Cancelled codes are in the index too, so a code taken away is never handed
-- to a second person and the counter can say what happened to it.
DROP INDEX IF EXISTS "ux_promotion_claims_code";

CREATE UNIQUE INDEX IF NOT EXISTS "ux_promotion_claims_site_code"
  ON "promotion_claims" ("workspace_id", "code");
