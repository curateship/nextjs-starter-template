CREATE TABLE IF NOT EXISTS "migration_state" (
  "key" text PRIMARY KEY NOT NULL,
  "applied_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "migration_state"
    WHERE "key" = '0075_public_brand_color'
  ) THEN
    UPDATE "workspaces"
    SET "settings" = jsonb_set(
      "settings",
      '{publicTheme}',
      CASE
        WHEN jsonb_typeof("settings"->'publicTheme') = 'object'
          THEN "settings"->'publicTheme'
        ELSE '{}'::jsonb
      END || jsonb_build_object(
        'brandColor',
        lower(trim("settings"->>'accentColor'))
      ),
      true
    )
    WHERE jsonb_typeof("settings") = 'object'
      AND trim("settings"->>'accentColor') ~* '^#[0-9a-f]{6}$'
      AND NOT (
        CASE
          WHEN jsonb_typeof("settings"->'publicTheme') = 'object'
            THEN "settings"->'publicTheme'
          ELSE '{}'::jsonb
        END ? 'brandColor'
      );

    INSERT INTO "migration_state" ("key")
    VALUES ('0075_public_brand_color')
    ON CONFLICT ("key") DO NOTHING;
  END IF;
END $$;
