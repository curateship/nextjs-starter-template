-- iPhones on the rack, Promo's side of phone farm file 08: the one-time
-- link that gets a photo or video onto an iPhone (part 55), and when an
-- iPhone account's inbox was last opened on the hour (part 52).
--
-- Additions only. Nothing stored is renamed or dropped.

-- A one-time link to a media library file. An iPhone cannot take a file over
-- USB the way an Android does, so the rack opens this link in Safari on the
-- phone and saves the file to Photos. The token is 32 random bytes as hex,
-- stored hashed; the link works once, within ten minutes, and the file is
-- never served from an open address.
CREATE TABLE IF NOT EXISTS "promo_media_links" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token_hash" varchar(64) NOT NULL,
  "storage_path" text NOT NULL,
  "mime_type" varchar(255) NOT NULL DEFAULT '',
  "expires_at" timestamptz NOT NULL,
  "used_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "ux_promo_media_links_token" ON "promo_media_links" ("token_hash");
CREATE INDEX IF NOT EXISTS "ix_promo_media_links_expires" ON "promo_media_links" ("expires_at");

-- When Promo last asked an iPhone account's phone to open its inbox of its
-- own accord. An iPhone hands no notifications to the rack, so in waking
-- hours each inbox is opened once an hour (Tyler, 18 Oct 2026). Null on an
-- Android account, whose reads follow the phone's notifications.
ALTER TABLE "promo_accounts" ADD COLUMN IF NOT EXISTS "inbox_asked_at" timestamptz;
