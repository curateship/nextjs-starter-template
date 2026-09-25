-- Passkeys (WebAuthn): a second way to sign in, alongside the password.
--
-- "passkeys" holds one row per registered credential. "public_key" is exactly
-- that - public - so unlike password hashes there is nothing here a database
-- thief could sign in with. "counter" is the authenticator's own use count,
-- kept so a cloned credential replaying an old signature can be refused.
CREATE TABLE IF NOT EXISTS "passkeys" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "credential_id" text NOT NULL UNIQUE,
  "public_key" text NOT NULL,
  "counter" bigint NOT NULL DEFAULT 0,
  "transports" text,
  "name" varchar(80) NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "last_used_at" timestamp with time zone
);

CREATE INDEX IF NOT EXISTS "ix_passkeys_user_id" ON "passkeys" ("user_id");

-- One row per sign-in or registration attempt in flight: the random challenge
-- the browser must sign. Stored server-side and spent on first use, so a
-- captured response can never be replayed. "user_id" is set while registering
-- (the challenge belongs to the signed-in account) and null for a sign-in,
-- where nobody is known yet.
CREATE TABLE IF NOT EXISTS "passkey_challenges" (
  "id" varchar(36) PRIMARY KEY,
  "challenge" text NOT NULL,
  "type" varchar(20) NOT NULL,
  "user_id" varchar(36) REFERENCES "users"("id") ON DELETE CASCADE,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  CONSTRAINT "passkey_challenges_type_check"
    CHECK ("type" in ('registration', 'authentication'))
);

CREATE INDEX IF NOT EXISTS "ix_passkey_challenges_expires_at"
  ON "passkey_challenges" ("expires_at");
