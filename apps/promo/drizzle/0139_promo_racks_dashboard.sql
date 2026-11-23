-- The Racks dashboard (workspace/tasks/Phone farm/12-racks-dashboard.md).
-- Tyler, 5 Nov 2026: "Rack dashboard > create rack > enter name, discription
-- > rack name (3 panel dashboard)". A rack is made by a person first, with a
-- name and a description, and the rack program joins that rack when it
-- pairs, instead of pairing making the rack.

-- Part 76: a rack made on the Racks dashboard has no key and no pairing date
-- until the rack program spends a code made for it.
ALTER TABLE "promo_racks" ALTER COLUMN "key_encrypted" DROP NOT NULL;
ALTER TABLE "promo_racks" ALTER COLUMN "paired_at" DROP NOT NULL;
ALTER TABLE "promo_racks" ALTER COLUMN "paired_at" DROP DEFAULT;

-- The description, written in the New rack window and then in place on the
-- rack's left panel, as the editor's document in JSON, or "" for none.
ALTER TABLE "promo_racks" ADD COLUMN IF NOT EXISTS "description" text NOT NULL DEFAULT '';

-- Part 90: the cover banner behind the left panel's header ("" for none) and
-- the rack's "/" block notes, the editor's document in JSON, or "" for none.
-- Tyler, 5 Nov 2026: "NO avatar just banner cover. Need tiptap editor with
-- blocks ability too".
ALTER TABLE "promo_racks" ADD COLUMN IF NOT EXISTS "banner_url" text NOT NULL DEFAULT '';
ALTER TABLE "promo_racks" ADD COLUMN IF NOT EXISTS "notes" text NOT NULL DEFAULT '';

-- When the rack was made, so the Racks dashboard lists a rack that has not
-- paired yet. A rack from before this file was made when it paired.
ALTER TABLE "promo_racks" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone NOT NULL DEFAULT now();
UPDATE "promo_racks" SET "created_at" = "paired_at" WHERE "paired_at" IS NOT NULL AND "created_at" > "paired_at";

-- A pairing code is made for one rack, and spending it gives that rack its key.
ALTER TABLE "promo_rack_codes" ADD COLUMN IF NOT EXISTS "rack_id" varchar(36) REFERENCES "promo_racks"("id") ON DELETE CASCADE;

-- Part 79: deleting a rack keeps each phone's Actions history and step
-- pictures. Finished actions lose their rack and nothing else.
ALTER TABLE "promo_phone_actions" ALTER COLUMN "rack_id" DROP NOT NULL;
ALTER TABLE "promo_phone_actions" DROP CONSTRAINT IF EXISTS "promo_phone_actions_rack_id_fkey";
ALTER TABLE "promo_phone_actions"
  ADD CONSTRAINT "promo_phone_actions_rack_id_fkey"
  FOREIGN KEY ("rack_id") REFERENCES "promo_racks"("id") ON DELETE SET NULL;

-- Part 87: the left menu's Phones link becomes Racks, at /admin/racks, in
-- every saved menu, as a top-level entry or one inside a group. The entry
-- keeps its id. A label someone typed is kept; only "Phones" becomes "Racks".
-- An empty list of entries or children stays an empty list, never null.
UPDATE "workspaces" AS "w"
SET "settings" = jsonb_set(
  "w"."settings",
  '{sections}',
  (
    SELECT jsonb_agg(
      CASE
        WHEN jsonb_typeof("s"."section"->'entries') = 'array' THEN jsonb_set(
          "s"."section",
          '{entries}',
          (
            SELECT COALESCE(jsonb_agg(
              CASE
                WHEN "e"."entry"->>'href' = '/admin/phones' THEN
                  "e"."entry"
                    || jsonb_build_object('href', '/admin/racks')
                    || CASE WHEN "e"."entry"->>'label' = 'Phones' THEN jsonb_build_object('label', 'Racks') ELSE '{}'::jsonb END
                WHEN jsonb_typeof("e"."entry"->'children') = 'array' THEN jsonb_set(
                  "e"."entry",
                  '{children}',
                  (
                    SELECT COALESCE(jsonb_agg(
                      CASE
                        WHEN "c"."child"->>'href' = '/admin/phones' THEN
                          "c"."child"
                            || jsonb_build_object('href', '/admin/racks')
                            || CASE WHEN "c"."child"->>'label' = 'Phones' THEN jsonb_build_object('label', 'Racks') ELSE '{}'::jsonb END
                        ELSE "c"."child"
                      END
                      ORDER BY "c"."ord"
                    ), '[]'::jsonb)
                    FROM jsonb_array_elements("e"."entry"->'children') WITH ORDINALITY AS "c"("child", "ord")
                  )
                )
                ELSE "e"."entry"
              END
              ORDER BY "e"."ord"
            ), '[]'::jsonb)
            FROM jsonb_array_elements("s"."section"->'entries') WITH ORDINALITY AS "e"("entry", "ord")
          )
        )
        ELSE "s"."section"
      END
      ORDER BY "s"."ord"
    )
    FROM jsonb_array_elements("w"."settings"->'sections') WITH ORDINALITY AS "s"("section", "ord")
  )
)
WHERE jsonb_typeof("w"."settings"->'sections') = 'array'
  AND jsonb_array_length("w"."settings"->'sections') > 0
  AND (
    jsonb_path_exists("w"."settings", '$.sections[*].entries[*] ? (@.href == "/admin/phones")')
    OR jsonb_path_exists("w"."settings", '$.sections[*].entries[*].children[*] ? (@.href == "/admin/phones")')
  );
