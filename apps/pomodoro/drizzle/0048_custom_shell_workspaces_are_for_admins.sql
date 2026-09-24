-- Members stop having workspaces.
--
-- Every sign-in made one, for everybody, regardless of role — and members never
-- see the switcher, so nobody noticed. The shell's own database had seven of
-- them, all empty, all called "My project", belonging to people who have no use
-- for a workspace and no way to reach one.
--
-- It was not only untidy. `/workspaces` had no admin check and the list,
-- create, rename and delete endpoints were open to any signed-in person, so a
-- member could make and delete workspaces on any app built on this shell.
-- Sign-in only makes one for an admin now, and those doors check.
--
-- **Only empty ones are removed.** A workspace holds contacts, segments,
-- broadcasts, templates, deliveries and email settings, and deleting one takes
-- all of that with it. Every member workspace found so far was created
-- automatically and never used, but "so far" is not a guarantee — so anything
-- with something in it is left alone, and whoever finds one can decide what it
-- was for. Better a stray row than a deletion nobody asked for.

DELETE FROM "workspaces" w
USING "users" u
WHERE w."user_id" = u."id"
  AND u."role" <> 'admin'
  AND NOT EXISTS (SELECT 1 FROM "contacts" c WHERE c."workspace_id" = w."id")
  AND NOT EXISTS (SELECT 1 FROM "contact_segments" s WHERE s."workspace_id" = w."id")
  AND NOT EXISTS (SELECT 1 FROM "broadcasts" b WHERE b."workspace_id" = w."id")
  AND NOT EXISTS (SELECT 1 FROM "broadcast_templates" t WHERE t."workspace_id" = w."id")
  AND NOT EXISTS (SELECT 1 FROM "deliveries" d WHERE d."workspace_id" = w."id")
  AND NOT EXISTS (SELECT 1 FROM "email_settings" e WHERE e."workspace_id" = w."id");
