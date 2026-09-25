-- Soft-delete with a restore window: deleting an account marks it instead of
-- removing it, so an accidental -- or regretted -- deletion can be undone.
--
-- `status` gains a third value and `deleted_at` records when the clock started.
-- The two are paired both ways by a check constraint, so a marked account can
-- never be missing its date and an ordinary account can never carry one.
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;

-- Who marked it. An account its own owner marked can be brought back by signing
-- in; one an admin marked cannot, or a member could quietly undo a moderation
-- decision. Null whenever the account is not marked.
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "deleted_by" varchar(36)
    REFERENCES "users"("id") ON DELETE SET NULL;

ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_status_check";

ALTER TABLE "users"
  ADD CONSTRAINT "users_status_check"
    CHECK ("status" in ('active', 'suspended', 'pending_deletion'));

ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_deleted_at_check";

ALTER TABLE "users"
  ADD CONSTRAINT "users_deleted_at_check"
    CHECK (("status" = 'pending_deletion') = ("deleted_at" is not null));

-- The purge only ever reads marked accounts, so the index only holds those.
CREATE INDEX IF NOT EXISTS "ix_users_deleted_at"
  ON "users" ("deleted_at")
  WHERE "status" = 'pending_deletion';
