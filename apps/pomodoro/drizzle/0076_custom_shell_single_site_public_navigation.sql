-- One-site apps have one public menu and footer. They used to save those
-- choices on whichever workspace the admin happened to be viewing, while the
-- signed-out page read a different workspace. The result was a saved menu and
-- footer that never appeared.
--
-- New writes keep this public chrome in the app-wide settings row when
-- workspace domains are disabled. Existing installs may have several old
-- workspace copies, so the most recently changed non-empty copy is the best
-- record of what an admin last meant to publish. Multisite deployments keep
-- reading each workspace and ignore this app-wide copy.
--
-- Search used to sit outside the saved menu. Put it first in every existing
-- menu so the new draggable item begins where the old fixed search bar did.

CREATE TABLE IF NOT EXISTS "migration_state" (
  "key" text PRIMARY KEY NOT NULL,
  "applied_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$
DECLARE
  "source_navigation" jsonb;
  "source_footer" jsonb;
  "source_copyright" jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "migration_state"
    WHERE "key" = '0076_single_site_public_navigation'
  ) THEN
    SELECT w."settings"->'publicNavigation'
    INTO "source_navigation"
    FROM "workspaces" w
    WHERE jsonb_typeof(w."settings") = 'object'
      AND jsonb_typeof(w."settings"->'publicNavigation') = 'array'
      AND jsonb_array_length(w."settings"->'publicNavigation') > 0
    ORDER BY w."updated_at" DESC, w."created_at" DESC, w."id" DESC
    LIMIT 1;

    SELECT w."settings"->'publicFooter'
    INTO "source_footer"
    FROM "workspaces" w
    WHERE jsonb_typeof(w."settings") = 'object'
      AND jsonb_typeof(w."settings"->'publicFooter') = 'array'
      AND jsonb_array_length(w."settings"->'publicFooter') > 0
    ORDER BY w."updated_at" DESC, w."created_at" DESC, w."id" DESC
    LIMIT 1;

    SELECT w."settings"->'publicFooterCopyright'
    INTO "source_copyright"
    FROM "workspaces" w
    WHERE jsonb_typeof(w."settings") = 'object'
      AND jsonb_typeof(w."settings"->'publicFooterCopyright') = 'string'
      AND trim(w."settings"->>'publicFooterCopyright') <> ''
    ORDER BY w."updated_at" DESC, w."created_at" DESC, w."id" DESC
    LIMIT 1;

    IF "source_navigation" IS NOT NULL
      OR "source_footer" IS NOT NULL
      OR "source_copyright" IS NOT NULL THEN

      INSERT INTO "settings" ("key", "settings", "created_at", "updated_at")
      VALUES ('default', '{}'::jsonb, now(), now())
      ON CONFLICT ("key") DO NOTHING;

      UPDATE "settings"
      SET "settings" = jsonb_set(
        "settings",
        '{publicNavigation}',
        "source_navigation",
        true
      ), "updated_at" = now()
      WHERE "key" = 'default'
        AND NOT ("settings" ? 'publicNavigation')
        AND "source_navigation" IS NOT NULL;

      UPDATE "settings"
      SET "settings" = jsonb_set(
        "settings",
        '{publicFooter}',
        "source_footer",
        true
      ), "updated_at" = now()
      WHERE "key" = 'default'
        AND NOT ("settings" ? 'publicFooter')
        AND "source_footer" IS NOT NULL;

      UPDATE "settings"
      SET "settings" = jsonb_set(
        "settings",
        '{publicFooterCopyright}',
        "source_copyright",
        true
      ), "updated_at" = now()
      WHERE "key" = 'default'
        AND NOT ("settings" ? 'publicFooterCopyright')
        AND "source_copyright" IS NOT NULL;
    END IF;

    INSERT INTO "migration_state" ("key")
    VALUES ('0076_single_site_public_navigation')
    ON CONFLICT ("key") DO NOTHING;
  END IF;

  UPDATE "settings"
  SET "settings" = jsonb_set(
    CASE
      WHEN jsonb_typeof("settings") = 'object' THEN "settings"
      ELSE '{}'::jsonb
    END,
    '{publicNavigation}',
    jsonb_build_array(
      jsonb_build_object('type', 'search', 'visible', true)
    ) ||
      CASE
        WHEN jsonb_typeof("settings"->'publicNavigation') = 'array'
          THEN "settings"->'publicNavigation'
        ELSE '[]'::jsonb
      END,
    true
  ), "updated_at" = now()
  WHERE "key" = 'default'
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(
        CASE
          WHEN jsonb_typeof("settings"->'publicNavigation') = 'array'
            THEN "settings"->'publicNavigation'
          ELSE '[]'::jsonb
        END
      ) item
      WHERE item->>'type' = 'search'
    );

  UPDATE "workspaces"
  SET "settings" = jsonb_set(
    CASE
      WHEN jsonb_typeof("settings") = 'object' THEN "settings"
      ELSE '{}'::jsonb
    END,
    '{publicNavigation}',
    jsonb_build_array(
      jsonb_build_object('type', 'search', 'visible', true)
    ) ||
      CASE
        WHEN jsonb_typeof("settings"->'publicNavigation') = 'array'
          THEN "settings"->'publicNavigation'
        ELSE '[]'::jsonb
      END,
    true
  )
  WHERE NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(
      CASE
        WHEN jsonb_typeof("settings"->'publicNavigation') = 'array'
          THEN "settings"->'publicNavigation'
        ELSE '[]'::jsonb
      END
    ) item
    WHERE item->>'type' = 'search'
  );
END $$;
