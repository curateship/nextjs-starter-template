-- Recipes, Backtests and Bots are one dashboard at /bots now (Tyler, 9 Nov
-- 2026: "Own dashboard, Bots", "One Bots link in the left menu replaces the
-- Recipes, Backtests and Live runs links"). The old addresses /admin/recipes,
-- /backtests and /flow-runs, and every address under them, open nothing: they
-- are gone, not forwarded, as /protocols went.
--
-- 1. Saved bell notices. A bot's notice kept the address of the run's old page,
--    /flow-runs/<id>. It now opens that bot on the Bots dashboard.
UPDATE "trade_notice_links"
SET "href" = '/bots?view=bots&open=' || substring("href" FROM '^/flow-runs/([^/?#]+)') || '&full=1'
WHERE "href" ~ '^/flow-runs/[^/?#]+$';

-- 2. Each site's saved left menu. Every link to one of the old addresses, in
--    any mix of capitals, comes out, wherever it sits. The first one that is a
--    top-level entry becomes the one Bots link at /bots, keeping its place,
--    its icon and who can see it. Anything that was nested under a removed
--    entry and is not an old link itself moves up into its place, so nothing
--    else is lost. A menu whose old links were all nested gets the Bots link
--    after its Trade link. A menu with none is left exactly as it was.
CREATE FUNCTION pg_temp.bots_old_href(href text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT lower(coalesce(href, '')) ~ '^/(admin/recipes|backtests|flow-runs)(/|\?|#|$)'
$$;

CREATE FUNCTION pg_temp.bots_menu(sections jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  section jsonb;
  entry jsonb;
  child jsonb;
  kept_children jsonb;
  lifted jsonb;
  new_entries jsonb;
  result jsonb := '[]'::jsonb;
  placed boolean := false;
  found_old boolean := false;
BEGIN
  FOR section IN SELECT value FROM jsonb_array_elements(sections) LOOP
    IF jsonb_typeof(section -> 'entries') IS DISTINCT FROM 'array' THEN
      result := result || jsonb_build_array(section);
      CONTINUE;
    END IF;
    new_entries := '[]'::jsonb;
    FOR entry IN SELECT value FROM jsonb_array_elements(section -> 'entries') LOOP
      kept_children := '[]'::jsonb;
      IF jsonb_typeof(entry -> 'children') = 'array' THEN
        FOR child IN SELECT value FROM jsonb_array_elements(entry -> 'children') LOOP
          IF pg_temp.bots_old_href(child ->> 'href') THEN
            found_old := true;
          ELSE
            kept_children := kept_children || jsonb_build_array(child);
          END IF;
        END LOOP;
        entry := jsonb_set(entry, '{children}', kept_children);
      END IF;
      IF NOT pg_temp.bots_old_href(entry ->> 'href') THEN
        new_entries := new_entries || jsonb_build_array(entry);
      ELSE
        found_old := true;
        IF NOT placed THEN
          placed := true;
          new_entries := new_entries || jsonb_build_array(
            entry || jsonb_build_object('id', 'item-bots', 'label', 'Bots', 'href', '/bots')
          );
        ELSE
          -- What was nested under a removed entry stays, in its place.
          lifted := '[]'::jsonb;
          FOR child IN SELECT value FROM jsonb_array_elements(kept_children) LOOP
            lifted := lifted || jsonb_build_array(child);
          END LOOP;
          new_entries := new_entries || lifted;
        END IF;
      END IF;
    END LOOP;
    result := result || jsonb_build_array(jsonb_set(section, '{entries}', new_entries));
  END LOOP;

  -- Only nested links were old: the Bots link goes after Trade.
  IF found_old AND NOT placed THEN
    sections := result;
    result := '[]'::jsonb;
    FOR section IN SELECT value FROM jsonb_array_elements(sections) LOOP
      IF jsonb_typeof(section -> 'entries') IS DISTINCT FROM 'array' THEN
        result := result || jsonb_build_array(section);
        CONTINUE;
      END IF;
      new_entries := '[]'::jsonb;
      FOR entry IN SELECT value FROM jsonb_array_elements(section -> 'entries') LOOP
        new_entries := new_entries || jsonb_build_array(entry);
        IF NOT placed AND lower(coalesce(entry ->> 'href', '')) = '/trade' THEN
          placed := true;
          new_entries := new_entries || jsonb_build_array(jsonb_build_object(
            'id', 'item-bots',
            'type', 'item',
            'label', 'Bots',
            'href', '/bots',
            'icon', 'workflow',
            'roles', jsonb_build_array('admin'),
            'visible', true
          ));
        END IF;
      END LOOP;
      result := result || jsonb_build_array(jsonb_set(section, '{entries}', new_entries));
    END LOOP;
  END IF;

  RETURN result;
END;
$$;

UPDATE "workspaces"
SET
  "settings" = jsonb_set("settings", '{sections}', pg_temp.bots_menu("settings" -> 'sections')),
  "updated_at" = now()
WHERE jsonb_typeof("settings" -> 'sections') = 'array'
  AND lower(("settings" -> 'sections')::text) ~ '"/(admin/recipes|backtests|flow-runs)';

-- 3. The members' and app roles' saved menus. The dashboard is admins only
--    ("Admins only"), so the old links come out with no Bots link put back.
CREATE FUNCTION pg_temp.bots_strip(sections jsonb) RETURNS jsonb
LANGUAGE sql AS $$
  SELECT coalesce(jsonb_agg(
    CASE
      WHEN jsonb_typeof(s.section -> 'entries') = 'array' THEN jsonb_set(
        s.section,
        '{entries}',
        coalesce((
          SELECT jsonb_agg(
            CASE
              WHEN jsonb_typeof(e.entry -> 'children') = 'array' THEN jsonb_set(
                e.entry,
                '{children}',
                coalesce((
                  SELECT jsonb_agg(c.child ORDER BY c.cord)
                  FROM jsonb_array_elements(e.entry -> 'children') WITH ORDINALITY AS c(child, cord)
                  WHERE NOT pg_temp.bots_old_href(c.child ->> 'href')
                ), '[]'::jsonb)
              )
              ELSE e.entry
            END
            ORDER BY e.eord
          )
          FROM jsonb_array_elements(s.section -> 'entries') WITH ORDINALITY AS e(entry, eord)
          WHERE NOT pg_temp.bots_old_href(e.entry ->> 'href')
        ), '[]'::jsonb)
      )
      ELSE s.section
    END
    ORDER BY s.ord
  ), '[]'::jsonb)
  FROM jsonb_array_elements(sections) WITH ORDINALITY AS s(section, ord)
$$;

UPDATE "settings"
SET "settings" = jsonb_set("settings", '{memberSections}', pg_temp.bots_strip("settings" -> 'memberSections'))
WHERE jsonb_typeof("settings" -> 'memberSections') = 'array'
  AND lower(("settings" -> 'memberSections')::text) ~ '"/(admin/recipes|backtests|flow-runs)';

UPDATE "settings"
SET "settings" = jsonb_set(
  "settings",
  '{roleSections}',
  (
    SELECT coalesce(jsonb_object_agg(
      r.key,
      CASE WHEN jsonb_typeof(r.value) = 'array' THEN pg_temp.bots_strip(r.value) ELSE r.value END
    ), '{}'::jsonb)
    FROM jsonb_each("settings" -> 'roleSections') AS r
  )
)
WHERE jsonb_typeof("settings" -> 'roleSections') = 'object'
  AND lower(("settings" -> 'roleSections')::text) ~ '"/(admin/recipes|backtests|flow-runs)';

-- 4. The shortcuts at the top of the left menu lose any link to an old
--    address, and the admin's start page and the members' home, where one
--    was set to an old address, go back to the default by being taken out.
UPDATE "settings"
SET "settings" = jsonb_set(
  "settings",
  '{topLeftShortcuts}',
  coalesce((
    SELECT jsonb_agg(t.shortcut ORDER BY t.ord)
    FROM jsonb_array_elements("settings" -> 'topLeftShortcuts') WITH ORDINALITY AS t(shortcut, ord)
    WHERE NOT pg_temp.bots_old_href(t.shortcut ->> 'href')
  ), '[]'::jsonb)
)
WHERE jsonb_typeof("settings" -> 'topLeftShortcuts') = 'array'
  AND lower(("settings" -> 'topLeftShortcuts')::text) ~ '"/(admin/recipes|backtests|flow-runs)';

UPDATE "settings"
SET "settings" = "settings" - 'adminRoute'
WHERE pg_temp.bots_old_href("settings" ->> 'adminRoute');

UPDATE "settings"
SET "settings" = "settings" - 'memberHomeRoute'
WHERE pg_temp.bots_old_href("settings" ->> 'memberHomeRoute');

DROP FUNCTION pg_temp.bots_strip(jsonb);
DROP FUNCTION pg_temp.bots_menu(jsonb);
DROP FUNCTION pg_temp.bots_old_href(text);
