-- Accounts, subscribers and leads become three separate lists (Tyler, 9 Nov
-- 2026: "users and subscribers are also seperate. Meaning that a user signs
-- up for an account to the app does not gets added to the subscribers list.
-- Subscribber lists are exclusive to impport, manual add or through an email
-- form"). Until now every account was copied onto the mailing list as a
-- contact marked 'Account' and tied to it by user_id.

-- The copies go. Their sends and segment rows go with them by cascade.
-- Somebody added by hand or imported who also has an account stays, as an
-- ordinary subscriber.
DELETE FROM "contacts" WHERE "source" = 'Account';

DROP INDEX IF EXISTS "ux_contacts_workspace_user";
ALTER TABLE "contacts" DROP COLUMN IF EXISTS "user_id";

-- A lead and a subscriber are separate lists that may share an address; the
-- link between them is not kept any more.
ALTER TABLE "crm_leads" DROP COLUMN IF EXISTS "contact_id";

-- Segment rules about accounts ("Has an account", "Plan") mean nothing on a
-- list with no accounts on it. A segment left with no rules is kept.
UPDATE "contact_segments"
SET "rules" = jsonb_set(
  "rules",
  '{conditions}',
  coalesce(
    (
      SELECT jsonb_agg(condition)
      FROM jsonb_array_elements("rules" -> 'conditions') AS condition
      WHERE condition ->> 'type' NOT IN ('account', 'plan')
    ),
    '[]'::jsonb
  )
)
WHERE jsonb_typeof("rules" -> 'conditions') = 'array'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements("rules" -> 'conditions') AS condition
    WHERE condition ->> 'type' IN ('account', 'plan')
  );

-- An account's own way out of automated mail, now that it is emailed directly
-- rather than as a contact with a subscribed status. System emails (verify,
-- reset and the rest) are not marketing and still go.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "automated_mail_off_at" timestamp with time zone;
