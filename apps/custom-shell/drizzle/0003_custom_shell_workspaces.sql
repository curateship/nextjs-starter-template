CREATE TABLE IF NOT EXISTS "custom_shell_workspaces" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "user_id" varchar(36) NOT NULL REFERENCES "custom_shell_users"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "is_default" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);

CREATE INDEX IF NOT EXISTS "ix_custom_shell_workspaces_user_id" ON "custom_shell_workspaces" ("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "ux_custom_shell_workspaces_one_default_per_user" ON "custom_shell_workspaces" ("user_id") WHERE "is_default";

INSERT INTO "custom_shell_workspaces" (
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
  "custom_shell_users"."id",
  COALESCE(NULLIF("custom_shell_settings"."settings"->>'workspaceName', ''), 'My project'),
  jsonb_build_object(
    'icon', 'briefcaseBusiness',
    'favicon', CASE
      WHEN COALESCE("custom_shell_settings"."settings"->>'favicon', '') LIKE '/api/v1/media/%' THEN ''
      ELSE COALESCE("custom_shell_settings"."settings"->>'favicon', '')
    END,
    'topNavigation', COALESCE("custom_shell_settings"."settings"->'topNavigation', '[]'::jsonb),
    'topRightNavigation', COALESCE(
      "custom_shell_settings"."settings"->'topRightNavigation',
      '[{"id":"feedback","visible":true},{"id":"theme","visible":true},{"id":"notifications","visible":true}]'::jsonb
    ),
    'sections', COALESCE(
      "custom_shell_settings"."settings"->'sections',
      '[{"id":"section-platform-settings","title":"Platform Settings","entries":[{"type":"item","id":"item-settings","label":"Settings","href":"/admin/settings","icon":"settings","visible":true}]}]'::jsonb
    )
  ),
  true,
  NOW(),
  NOW()
FROM "custom_shell_users"
LEFT JOIN "custom_shell_settings" ON "custom_shell_settings"."key" = 'default'
WHERE NOT EXISTS (
  SELECT 1
  FROM "custom_shell_workspaces"
  WHERE "custom_shell_workspaces"."user_id" = "custom_shell_users"."id"
);
