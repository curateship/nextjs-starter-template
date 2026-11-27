-- Share links: a link to one finished export that somebody without an account
-- can open and watch, until the person who made it turns it off.
--
-- The token is the whole lock. Anybody holding it can watch and save the file,
-- so it is 64 hex characters from 32 random bytes: guessing one would take
-- longer than the file will exist. It is kept as written rather than hashed so
-- the owner can copy the same link again from the Exports page; a hashed token
-- could only be shown once.
--
-- A link is dead when it is revoked, when its expiry has passed, or when its
-- export is deleted. Deleting the export deletes its links with it. Deleting
-- the account that made them does the same.
--
-- One live link per export: the partial unique index refuses a second
-- unrevoked row, so making a new link revokes the old one first. An expired
-- link is revoked on the way, so it does not block its replacement.
CREATE TABLE IF NOT EXISTS "video_export_shares" (
  "id" varchar(36) PRIMARY KEY,
  "token" varchar(64) NOT NULL UNIQUE,
  "export_id" varchar(36) NOT NULL REFERENCES "video_render_jobs" ("id") ON DELETE CASCADE,
  "user_id" varchar(36) NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "created_at" timestamptz NOT NULL,
  "expires_at" timestamptz,
  "revoked_at" timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS "ux_video_export_shares_export_live"
  ON "video_export_shares" ("export_id")
  WHERE "revoked_at" IS NULL;
