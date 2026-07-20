CREATE TABLE IF NOT EXISTS "workspaces" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "is_default" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);

CREATE INDEX IF NOT EXISTS "ix_workspaces_user_id" ON "workspaces" ("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "ux_workspaces_one_default_per_user" ON "workspaces" ("user_id") WHERE "is_default";

-- One-time backfill: gives every account that predates workspaces one built from
-- the settings row. It is recorded in "migration_state" because this file is
-- replayed on every predev, and re-running it would hand a brand new account the
-- pre-SaaS navigation instead of the current defaults in src/server/workspaces.ts.
CREATE TABLE IF NOT EXISTS "migration_state" (
  "key" text PRIMARY KEY NOT NULL,
  "applied_at" timestamp with time zone DEFAULT now() NOT NULL
);

INSERT INTO "workspaces" (
  "id",
  "user_id",
  "name",
  "settings",
  "is_default",
  "created_at",
  "updated_at"
)
SELECT
  gen_random_uuid()::text,
  "users"."id",
  COALESCE(NULLIF("settings"."settings"->>'workspaceName', ''), 'My project'),
  jsonb_build_object(
    'icon', 'briefcaseBusiness',
    'favicon', CASE
      WHEN COALESCE("settings"."settings"->>'favicon', '') LIKE '/api/v1/media/%' THEN ''
      ELSE COALESCE("settings"."settings"->>'favicon', '')
    END,
    'topNavigation', COALESCE("settings"."settings"->'topNavigation', '[]'::jsonb),
    'topRightNavigation', COALESCE(
      "settings"."settings"->'topRightNavigation',
      '[{"id":"feedback","visible":true},{"id":"theme","visible":true},{"id":"notifications","visible":true}]'::jsonb
    ),
    'sections', COALESCE(
      "settings"."settings"->'sections',
      '[{"id":"section-platform-settings","title":"Platform Settings","entries":[{"type":"item","id":"item-feedback","label":"Feedback","href":"/admin/feedback","icon":"messageSquarePlus","visible":true,"children":[{"id":"item-feedback-comments","label":"Comments","href":"/admin/feedback/comments","icon":"message-square-text"}]},{"type":"item","id":"item-media","label":"Media","href":"/admin/media","icon":"image","visible":true},{"type":"item","id":"item-notifications","label":"Notifications","href":"/admin/notifications","icon":"bell","visible":true},{"type":"item","id":"item-settings","label":"Settings","href":"/admin/settings","icon":"settings","visible":true}]}]'::jsonb
    )
  ),
  true,
  NOW(),
  NOW()
FROM "users"
LEFT JOIN "settings" ON "settings"."key" = 'default'
WHERE NOT EXISTS (
  SELECT 1
  FROM "workspaces"
  WHERE "workspaces"."user_id" = "users"."id"
)
AND NOT EXISTS (
  SELECT 1 FROM "migration_state" WHERE "key" = '0003_workspace_backfill'
);

INSERT INTO "migration_state" ("key")
VALUES ('0003_workspace_backfill')
ON CONFLICT ("key") DO NOTHING;
