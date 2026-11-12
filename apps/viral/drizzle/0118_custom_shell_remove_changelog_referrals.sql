-- Referrals, the Changelog, the admin Notifications page and the Overview's
-- widgets leave the shell (Tyler, 8 Nov 2026,
-- workspace/tasks/features/admin/admin.md B5 to B8). Referrals: "each app
-- should dictate if it should have its own or not". What they stored goes with
-- them, and so does every saved setting that still points at them.

-- Referrals: the invite records, then each account's invite code.
DROP TABLE IF EXISTS "referrals";
DROP INDEX IF EXISTS "ux_users_referral_code";
ALTER TABLE "users" DROP COLUMN IF EXISTS "referral_code";

-- The Changelog. Its notices go first, so the type check below can drop the
-- kind. The type list otherwise only ever grows, because notices of a kind may
-- be stored; narrowing it here is safe only because none are left.
DELETE FROM "notifications" WHERE "type" = 'changelog';
DROP INDEX IF EXISTS "ix_notifications_changelog_entry_id";
ALTER TABLE "notifications" DROP COLUMN IF EXISTS "changelog_entry_id";
DROP TABLE IF EXISTS "changelog_entries";
ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "notifications_type_check";
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_type_check"
  CHECK ("type" IN ('feedback_vote', 'feedback_comment', 'feedback_merged', 'announcement', 'ai_limit_warning', 'ai_limit_reached', 'automation_approval', 'automation_failed', 'account_update', 'system_email_failed', 'app_activity', 'crm_follow_up', 'crm_mail_arrived'));

-- The "Changelog email with approval" automation template is gone, so an
-- admin's saved copy of it has nothing to stand in for. Flows already made
-- from it are ordinary flows and stay.
DELETE FROM "automation_template_overrides" WHERE "template_key" = 'changelog-approval';

-- The bell's switch for Product updates, in the app-wide settings row.
UPDATE "settings"
SET "settings" = "settings" #- '{notificationTypes,changelog}'
WHERE jsonb_typeof("settings"->'notificationTypes') = 'object'
  AND "settings"->'notificationTypes' ? 'changelog';

-- A home route pointing at a removed page would send everyone who signs in
-- to a page that is not there. Empty is the default: members get their own
-- home page and admins the admin home.
UPDATE "settings"
SET "settings" = jsonb_set("settings", '{memberHomeRoute}', '""'::jsonb)
WHERE "settings"->>'memberHomeRoute' ~ '^/(changelog|admin/notifications|admin/referrals)(/|\?|#|$)';
UPDATE "settings"
SET "settings" = jsonb_set("settings", '{adminRoute}', '""'::jsonb)
WHERE "settings"->>'adminRoute' ~ '^/(changelog|admin/notifications|admin/referrals)(/|\?|#|$)';

-- The member menu and each app role's menu: the Changelog and What's new
-- links a fresh install gave members. Saved menus are drawn exactly as saved,
-- so a link left here would point at nothing. A section goes only when these
-- links were all it held, the same rule `stripRetiredAccountEntries` follows.
CREATE FUNCTION pg_temp.custom_shell_strip_changelog_links(sections jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(jsonb_agg(cleaned.section ORDER BY cleaned.ord), '[]'::jsonb)
  FROM (
    SELECT
      s.ord,
      s.section AS original,
      CASE
        WHEN jsonb_typeof(s.section->'entries') = 'array' THEN jsonb_set(
          s.section,
          '{entries}',
          coalesce((
            SELECT jsonb_agg(
              CASE
                WHEN jsonb_typeof(e.entry->'children') = 'array' THEN jsonb_set(
                  e.entry,
                  '{children}',
                  coalesce((
                    SELECT jsonb_agg(c.child ORDER BY c.cord)
                    FROM jsonb_array_elements(e.entry->'children') WITH ORDINALITY AS c(child, cord)
                    WHERE coalesce(c.child->>'href', '') !~ '^/changelog(/|\?|#|$)'
                  ), '[]'::jsonb)
                )
                ELSE e.entry
              END
              ORDER BY e.eord
            )
            FROM jsonb_array_elements(s.section->'entries') WITH ORDINALITY AS e(entry, eord)
            WHERE coalesce(e.entry->>'href', '') !~ '^/changelog(/|\?|#|$)'
          ), '[]'::jsonb)
        )
        ELSE s.section
      END AS section
    FROM jsonb_array_elements(sections) WITH ORDINALITY AS s(section, ord)
  ) cleaned
  WHERE NOT (
    jsonb_typeof(cleaned.original->'entries') = 'array'
    AND jsonb_array_length(cleaned.original->'entries') > 0
    AND jsonb_array_length(cleaned.section->'entries') = 0
  )
$$;

UPDATE "settings"
SET "settings" = jsonb_set(
  "settings",
  '{memberSections}',
  pg_temp.custom_shell_strip_changelog_links("settings"->'memberSections')
)
WHERE jsonb_typeof("settings"->'memberSections') = 'array';

UPDATE "settings"
SET "settings" = jsonb_set(
  "settings",
  '{roleSections}',
  (
    SELECT coalesce(
      jsonb_object_agg(
        r.key,
        CASE
          WHEN jsonb_typeof(r.value) = 'array'
            THEN pg_temp.custom_shell_strip_changelog_links(r.value)
          ELSE r.value
        END
      ),
      '{}'::jsonb
    )
    FROM jsonb_each("settings"->'roleSections') AS r
  )
)
WHERE jsonb_typeof("settings"->'roleSections') = 'object';

DROP FUNCTION pg_temp.custom_shell_strip_changelog_links(jsonb);

-- The Overview's card arrangement, saved on each workspace.
UPDATE "workspaces"
SET "settings" = "settings" - 'dashboardWidgets'
WHERE jsonb_typeof("settings") = 'object'
  AND "settings" ? 'dashboardWidgets';
