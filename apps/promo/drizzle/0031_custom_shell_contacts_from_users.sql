-- Contacts come from the accounts on the app.
--
-- Before this, the contacts list was typed in by hand and had nothing to do
-- with who had actually signed up — so a newsletter went to whoever somebody
-- remembered to add. Now every account is a contact, kept in step by
-- `syncContactsFromUsers`, and tagged with its role so "everyone who is an
-- admin" is a segment without anybody maintaining a list.
--
-- The contact row still exists in its own right rather than becoming a join
-- onto users. Delivery rows point at a contact id, and that pointer is what
-- makes sending exactly once work — it has to stay valid even for somebody who
-- has no account at all.

ALTER TABLE "contacts"
  ADD COLUMN IF NOT EXISTS "user_id" varchar(36)
    REFERENCES "users"("id") ON DELETE CASCADE;

-- One contact per account. Without this the sync would add somebody again
-- every time it ran. Partial, because the hand-added contacts all have a null
-- user_id and must not collide with each other.
CREATE UNIQUE INDEX IF NOT EXISTS "ux_contacts_workspace_user"
  ON "contacts" ("workspace_id", "user_id")
  WHERE "user_id" IS NOT NULL;

-- Adopt any contact that was added by hand for an address that turns out to
-- belong to an account, so the sync updates that row rather than tripping over
-- the email uniqueness and failing.
UPDATE "contacts" AS c
SET "user_id" = u."id"
FROM "users" AS u
WHERE c."user_id" IS NULL
  AND lower(c."email") = lower(u."email");
