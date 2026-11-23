-- A sequence and an automation may share a name (Tyler, 16 Nov 2026, of a
-- new sequence called "test" refused because an automation had that name).
-- They are listed on different screens, so a name only has to be different
-- from the others of its own kind on the same site.
ALTER TABLE "automations" DROP CONSTRAINT IF EXISTS "automations_workspace_name_unique";
ALTER TABLE "automations" DROP CONSTRAINT IF EXISTS "automations_workspace_kind_name_unique";
ALTER TABLE "automations"
  ADD CONSTRAINT "automations_workspace_kind_name_unique" UNIQUE ("workspace_id", "kind", "name");
