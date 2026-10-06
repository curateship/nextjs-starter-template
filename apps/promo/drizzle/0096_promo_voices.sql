-- A voice as its own record, so accounts can share one.
--
-- The three boxes the AI writes with, the voice, the product and the rules,
-- were columns on the Reddit account. A second account, or an Instagram one,
-- would have had to retype them. Tyler, 6 Oct 2026, asked for them to move off
-- the account so two accounts can share one voice.
--
-- Nothing stored is renamed or dropped. `promo_accounts.voice`, `.product` and
-- `.comment_rules` stay where they are and the code stops reading them.

CREATE TABLE IF NOT EXISTS "promo_voices" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  -- What to call it on screen. The person's own words.
  "name" varchar(120) NOT NULL,
  -- How the AI should sound.
  "voice" text NOT NULL DEFAULT '',
  -- What is being promoted, mentioned only when it genuinely fits.
  "product" text NOT NULL DEFAULT '',
  -- Lines the AI must not cross.
  "comment_rules" text NOT NULL DEFAULT '',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "ix_promo_voices_user" ON "promo_voices" ("user_id");

-- An account points at a voice. Deleting the voice leaves the account with
-- none, which drafts plainly, rather than deleting the account.
ALTER TABLE "promo_accounts"
  ADD COLUMN IF NOT EXISTS "voice_id" varchar(36)
    REFERENCES "promo_voices"("id") ON DELETE SET NULL;

-- Adopt what exists: one voice per account, called "Main voice", carrying that
-- account's three boxes word for word. Its id is worked out from the account's
-- id, so the second statement can find it without a lookup table.
INSERT INTO "promo_voices" ("id", "user_id", "name", "voice", "product", "comment_rules")
SELECT
  md5('promo-voice:' || "a"."id")::uuid::text,
  "a"."user_id",
  'Main voice',
  "a"."voice",
  "a"."product",
  "a"."comment_rules"
FROM "promo_accounts" AS "a"
WHERE "a"."voice_id" IS NULL
ON CONFLICT ("id") DO NOTHING;

UPDATE "promo_accounts"
SET "voice_id" = md5('promo-voice:' || "id")::uuid::text
WHERE "voice_id" IS NULL;
