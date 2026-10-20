-- One "Library" link in the left menu in place of Videos, Notes and Posts
-- (Tyler, 20 Oct 2026: "One "Library" link"). The Library link takes the spot
-- of the first of the three a menu has, wherever it sits, and the others are
-- taken out, as links of their own or inside a group. A menu with none of
-- them gets Library after the first entry of the first section, the place
-- 0097 used. A menu that already links to /library keeps its own and only
-- loses the three. A menu never saved has nothing to change.
--
-- Every saved menu changes: each site's admin menu, saved on its workspace,
-- and the one members' menu, saved app-wide. `/library` is not under
-- `/admin`, so the sidebar shows it to a member.

CREATE FUNCTION pg_temp.note_library_menu(sections jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  library jsonb := '{"type":"item","id":"item-note-library","href":"/library","label":"Library","icon":"library","visible":true}'::jsonb;
  old_links text[] := ARRAY['/videos', '/notes', '/posts'];
  placed boolean;
  result jsonb := '[]'::jsonb;
  section jsonb;
  entries jsonb;
  entry jsonb;
  children jsonb;
  child jsonb;
  at integer;
BEGIN
  IF jsonb_typeof(sections) <> 'array' OR jsonb_array_length(sections) = 0 THEN
    RETURN sections;
  END IF;
  placed := jsonb_path_exists(sections, '$[*].entries[*] ? (@.href == "/library")')
    OR jsonb_path_exists(sections, '$[*].entries[*].children[*] ? (@.href == "/library")');

  FOR section IN SELECT value FROM jsonb_array_elements(sections) LOOP
    -- A section with no list of entries is kept exactly as it was.
    IF jsonb_typeof(section->'entries') IS DISTINCT FROM 'array' THEN
      result := result || jsonb_build_array(section);
      CONTINUE;
    END IF;
    entries := '[]'::jsonb;
    FOR entry IN SELECT value FROM jsonb_array_elements(section->'entries') LOOP
      IF entry->>'href' = ANY (old_links) THEN
        IF NOT placed THEN
          -- Library keeps the replaced link's own visibility, roles and any
          -- links grouped under it, so a hidden or admin-only link stays so.
          entries := entries || jsonb_build_array(
            library || (entry - 'type' - 'id' - 'href' - 'label' - 'icon')
          );
          placed := true;
        END IF;
      ELSIF jsonb_typeof(entry->'children') = 'array' THEN
        children := '[]'::jsonb;
        FOR child IN SELECT value FROM jsonb_array_elements(entry->'children') LOOP
          IF child->>'href' = ANY (old_links) THEN
            IF NOT placed THEN
              children := children || jsonb_build_array(
                library || (child - 'type' - 'id' - 'href' - 'label' - 'icon')
              );
              placed := true;
            END IF;
          ELSE
            children := children || jsonb_build_array(child);
          END IF;
        END LOOP;
        entries := entries || jsonb_build_array(jsonb_set(entry, '{children}', children));
      ELSE
        entries := entries || jsonb_build_array(entry);
      END IF;
    END LOOP;
    result := result || jsonb_build_array(jsonb_set(section, '{entries}', entries));
  END LOOP;

  -- None of the three anywhere: Library goes after the first entry of the
  -- first section that has a list of entries.
  IF NOT placed THEN
    FOR at IN 0 .. jsonb_array_length(result) - 1 LOOP
      IF jsonb_typeof(result -> at -> 'entries') = 'array' THEN
        result := jsonb_set(
          result,
          ARRAY[at::text, 'entries'],
          jsonb_insert(result -> at -> 'entries', '{1}', library, false)
        );
        EXIT;
      END IF;
    END LOOP;
  END IF;
  RETURN result;
END;
$$;

UPDATE "workspaces"
SET "settings" = jsonb_set("settings", '{sections}', pg_temp.note_library_menu("settings"->'sections'))
WHERE jsonb_typeof("settings"->'sections') = 'array'
  AND jsonb_array_length("settings"->'sections') > 0;

UPDATE "settings"
SET "settings" = jsonb_set("settings", '{memberSections}', pg_temp.note_library_menu("settings"->'memberSections'))
WHERE jsonb_typeof("settings"->'memberSections') = 'array'
  AND jsonb_array_length("settings"->'memberSections') > 0;

DROP FUNCTION pg_temp.note_library_menu(jsonb);
