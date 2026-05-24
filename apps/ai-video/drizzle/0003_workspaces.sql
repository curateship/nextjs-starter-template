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
  COALESCE(NULLIF("settings"."settings"->>'workspaceName', ''), 'My brand'),
  jsonb_build_object(
    'icon', 'briefcaseBusiness',
    'favicon', CASE
      WHEN COALESCE("settings"."settings"->>'favicon', '') LIKE '/api/v1/media/%' THEN ''
      ELSE COALESCE("settings"."settings"->>'favicon', '')
    END,
    'topNavigation', COALESCE(
      "settings"."settings"->'topNavigation',
      '[{"id":"dashboard","label":"Dashboard","href":"/","icon":"layoutDashboard","visible":true}]'::jsonb
    ),
    'topRightNavigation', COALESCE(
      "settings"."settings"->'topRightNavigation',
      '[{"id":"feedback","visible":true},{"id":"theme","visible":true},{"id":"notifications","visible":true}]'::jsonb
    ),
    'sections', COALESCE(
      "settings"."settings"->'sections',
      '[{"id":"section-ai-video","title":"AI Video","entries":[{"type":"item","id":"item-modules","label":"Modules","href":"/admin/modules","icon":"library","visible":true,"children":[{"id":"item-video-ugc-ad","label":"UGC Ad Video","href":"/admin/modules/ugc-ad-video"}]},{"type":"item","id":"item-media","label":"Media","href":"/admin/media","icon":"image","visible":true,"children":[{"id":"item-media-images","label":"Images","href":"/admin/media/images"},{"id":"item-media-videos","label":"Videos","href":"/admin/media/videos"}]},{"type":"item","id":"item-settings","label":"Settings","href":"/admin/settings","icon":"settings","visible":true}]}]'::jsonb
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
);
