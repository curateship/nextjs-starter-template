-- Google sign-in: an account can be reached by proving you own a Google
-- account, instead of by typing a password.
--
-- `oauth_accounts` is the link between one Google account and one account here.
-- It is keyed on the id Google gives the person, not on their email address,
-- because that id never changes -- so somebody who later changes their Google
-- address still comes back to the same account rather than a second one.
CREATE TABLE IF NOT EXISTS "oauth_accounts" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "user_id" varchar(36) NOT NULL
    REFERENCES "users"("id") ON DELETE CASCADE,
  "provider" varchar(20) NOT NULL,
  -- Google's `sub`: the permanent id for that Google account.
  "provider_account_id" varchar(255) NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  CONSTRAINT "oauth_accounts_provider_check"
    CHECK ("provider" in ('google')),
  -- One Google account leads to exactly one account here. This is also what
  -- makes two sign-ins arriving at the same moment safe: the second one hits
  -- this constraint instead of writing a second link.
  CONSTRAINT "oauth_accounts_provider_account_unique"
    UNIQUE ("provider", "provider_account_id")
);

CREATE INDEX IF NOT EXISTS "ix_oauth_accounts_user_id" ON "oauth_accounts" ("user_id");

-- An account created by signing in with Google has no password at all. Null is
-- the honest record of that; a made-up hash would be a password nobody knows,
-- stored in a column whose whole job is to say a password exists.
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;
