-- Every existing profile switched on, the same way a new account starts
-- (`NEW_PROFILE_DEFAULTS` in src/lib/pomodoro/public-profile.ts). Tyler, 17
-- Oct 2026: "Make profile public and all details checked and leaderboard on
-- by default. username can be there first name", then "yes switch existing
-- accounts on too".
--
-- An operator's hide is left alone: a hidden page still answers 404 and a
-- member taken off the board stays off. A handle or display name somebody
-- already has is kept. Only an empty one is filled from the first name, with
-- the same rules `handleCandidatesFor` uses: lowercase, accents dropped, then
-- 2, 3, 4 on the end until one is free, skipping short and reserved ones.

UPDATE "pomodoro_profiles"
SET
  "profile_public" = true,
  "leaderboard_opt_in" = true,
  "listed" = true,
  "show_figures" = true,
  "show_badges" = true,
  "show_heatmap" = true,
  "show_projects" = true,
  "show_focusing_now" = true,
  "show_room" = true,
  "show_shared_media" = true,
  "updated_at" = now();

UPDATE "pomodoro_profiles" AS p
SET "public_display_name" = left((regexp_split_to_array(btrim(u."name"), '\s+'))[1], 50)
FROM "users" AS u
WHERE u."id" = p."user_id"
  AND p."public_display_name" IS NULL
  AND btrim(u."name") <> '';

DO $$
DECLARE
  reserved text[] := ARRAY[
    'about', 'account', 'admin', 'api', 'assets', 'backgrounds', 'badge',
    'billing', 'blog', 'changelog', 'contact', 'dashboard', 'docs', 'groups',
    'help', 'history', 'home', 'leaderboard', 'login', 'logout', 'maintenance',
    'me', 'media', 'people', 'pricing', 'privacy', 'public', 'register',
    'robots', 'rooms', 'root', 'search', 'settings', 'signin', 'signout',
    'signup', 'sitemap', 'sounds', 'static', 'support', 'tasks', 'team',
    'terms', 'timer', 'tools', 'u', 'user', 'users', 'workspaces'
  ];
  member record;
  base text;
  candidate text;
  n integer;
BEGIN
  FOR member IN
    SELECT p."user_id", u."name"
    FROM "pomodoro_profiles" AS p
    JOIN "users" AS u ON u."id" = p."user_id"
    WHERE p."handle" IS NULL
    ORDER BY u."created_at"
  LOOP
    -- NFKD then dropping the marks, exactly as the app's own
    -- `.normalize("NFKD").replace(/[̀-ͯ]/g, "")`, so José is
    -- `jose` here and at sign-up alike.
    base := regexp_replace(
      regexp_replace(
        normalize(lower((regexp_split_to_array(btrim(member."name"), '\s+'))[1]), NFKD),
        '[̀-ͯ]', '', 'g'
      ),
      '[^a-z0-9_-]', '', 'g'
    );
    base := left(coalesce(base, ''), 26);
    IF base = '' THEN
      base := 'member';
    END IF;

    n := 1;
    LOOP
      candidate := CASE WHEN n = 1 THEN base ELSE base || n END;
      EXIT WHEN candidate ~ '^[a-z0-9_-]{3,30}$'
        AND NOT candidate = ANY (reserved)
        AND NOT EXISTS (
          SELECT 1 FROM "pomodoro_profiles" WHERE "handle" = candidate
        );
      n := n + 1;
    END LOOP;

    UPDATE "pomodoro_profiles" SET "handle" = candidate
    WHERE "user_id" = member."user_id";
  END LOOP;
END $$;
