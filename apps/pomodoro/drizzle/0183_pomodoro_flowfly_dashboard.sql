-- The Flowfly admin dashboard (Tyler, 13 Nov 2026: "consolidate and combine
-- all of the app's dashboard into one 3 panel dashboard", then "take all
-- seven"): every Pomodoro admin page is now a tab of one page at
-- /admin/flowfly. See workspace/docs/admin-dashboard.md.
--
-- Each admin's left page on it, the same shape as Promo's
-- promo_anti_detect_pages.
CREATE TABLE IF NOT EXISTS "pomodoro_admin_pages" (
  "user_id" varchar(36) PRIMARY KEY NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "body" text NOT NULL DEFAULT '',
  "cover_url" text,
  "cover_images" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "locked" boolean NOT NULL DEFAULT false,
  "widgets" jsonb,
  "sections" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "updated_at" timestamp with time zone NOT NULL
);

-- The left menu: in every saved menu, the first /admin/pomodoro-* link in a
-- section becomes one Flowfly link, and every other one goes, children
-- included ("One Flowfly link replaces the ~20 Pomodoro links").
UPDATE "workspaces" AS "w"
SET "settings" = jsonb_set(
  "w"."settings",
  '{sections}',
  (
    SELECT jsonb_agg(
      CASE
        WHEN jsonb_typeof("s"."section"->'entries') <> 'array' THEN "s"."section"
        ELSE jsonb_set(
          "s"."section",
          '{entries}',
          COALESCE(
            (
              SELECT jsonb_agg(
                CASE
                  WHEN "e"."first" THEN jsonb_build_object(
                    'id', 'item-pomodoro-flowfly',
                    'type', 'item',
                    'label', 'Flowfly',
                    'href', '/admin/flowfly',
                    'icon', 'layoutDashboard',
                    'visible', true
                  )
                  WHEN jsonb_typeof("e"."entry"->'children') = 'array' THEN jsonb_set(
                    "e"."entry",
                    '{children}',
                    COALESCE(
                      (
                        SELECT jsonb_agg("c"."child" ORDER BY "c"."ord")
                        FROM jsonb_array_elements("e"."entry"->'children') WITH ORDINALITY AS "c"("child", "ord")
                        WHERE COALESCE("c"."child"->>'href', '') NOT LIKE '/admin/pomodoro-%'
                      ),
                      '[]'::jsonb
                    )
                  )
                  ELSE "e"."entry"
                END
                ORDER BY "e"."ord"
              )
              FROM (
                SELECT
                  "x"."entry",
                  "x"."ord",
                  COALESCE("x"."entry"->>'href', '') LIKE '/admin/pomodoro-%' AS "old",
                  "x"."ord" = (
                    SELECT min("y"."ord")
                    FROM jsonb_array_elements("s"."section"->'entries') WITH ORDINALITY AS "y"("entry", "ord")
                    WHERE COALESCE("y"."entry"->>'href', '') LIKE '/admin/pomodoro-%'
                  ) AS "first"
                FROM jsonb_array_elements("s"."section"->'entries') WITH ORDINALITY AS "x"("entry", "ord")
              ) AS "e"
              WHERE "e"."first" OR NOT "e"."old"
            ),
            '[]'::jsonb
          )
        )
      END
      ORDER BY "s"."ord"
    )
    FROM jsonb_array_elements("w"."settings"->'sections') WITH ORDINALITY AS "s"("section", "ord")
  )
)
WHERE jsonb_typeof("w"."settings"->'sections') = 'array'
  AND jsonb_array_length("w"."settings"->'sections') > 0
  AND (
    jsonb_path_exists("w"."settings", '$.sections[*].entries[*] ? (@.href starts with "/admin/pomodoro-")')
    OR jsonb_path_exists("w"."settings", '$.sections[*].entries[*].children[*] ? (@.href starts with "/admin/pomodoro-")')
  );

-- Bell notices remember the address they open: every one still holding an
-- old page is pointed at its tab, the rest of its address kept
-- (`?sharing=waiting` and the like). Chat has no tab any more (Tyler: "we
-- dont need this tab"), so its notices open Rooms. Focus and Leaderboard
-- went the same way, so theirs open Profiles, the first Members tab.
UPDATE "pomodoro_notice_links" AS "l"
SET "href" = '/admin/flowfly?section=' || "m"."section"
  || CASE WHEN "m"."list" = '' THEN '' ELSE '&list=' || "m"."list" END
  || CASE WHEN position('?' IN "l"."href") > 0 THEN '&' || split_part("l"."href", '?', 2) ELSE '' END
FROM (
  VALUES
    ('/admin/pomodoro-rooms', 'rooms', ''),
    ('/admin/pomodoro-room-repeats', 'rooms', 'weekly'),
    ('/admin/pomodoro-invites', 'rooms', 'invites'),
    ('/admin/pomodoro-room-presets', 'rooms', 'presets'),
    ('/admin/pomodoro-chat', 'rooms', ''),
    ('/admin/pomodoro-focus', 'members', ''),
    ('/admin/pomodoro-profiles', 'members', ''),
    ('/admin/pomodoro-leaderboard', 'members', ''),
    ('/admin/pomodoro-achievements', 'members', 'badges'),
    ('/admin/pomodoro-simulated', 'members', 'madeup'),
    ('/admin/pomodoro-reports', 'safety', ''),
    ('/admin/pomodoro-bans', 'safety', 'bans'),
    ('/admin/pomodoro-blocks', 'safety', 'blocks'),
    ('/admin/pomodoro-groups', 'social', ''),
    ('/admin/pomodoro-follows', 'social', 'follows'),
    ('/admin/pomodoro-tasks', 'tasks', ''),
    ('/admin/pomodoro-sessions', 'tasks', 'sessions'),
    ('/admin/pomodoro-task-repeats', 'tasks', 'repeats'),
    ('/admin/pomodoro-projects', 'tasks', 'projects'),
    ('/admin/pomodoro-tags', 'tasks', 'tags'),
    ('/admin/pomodoro-themes', 'library', ''),
    ('/admin/pomodoro-media', 'library', ''),
    ('/admin/pomodoro-sounds', 'library', 'sounds'),
    ('/admin/pomodoro-uploads', 'library', 'uploads'),
    ('/admin/pomodoro-generations', 'library', 'generations')
) AS "m"("old", "section", "list")
WHERE split_part("l"."href", '?', 1) = "m"."old";
