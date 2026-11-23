-- A habit's icon is any icon the shell's icon picker offers, its library or
-- any Lucide icon by name, in place of a fixed list of 24 (Tyler, 31 Oct 2026:
-- "We should reuse the existing icon picker we currently have with its custom
-- icon function too"). Lucide names run to 35 characters, so the column
-- widens, and the old names that differ from Lucide's become Lucide's. The
-- rest (droplet, bike, sun and so on) are already Lucide names.
ALTER TABLE "project_habits" ALTER COLUMN "icon" TYPE varchar(64);
UPDATE "project_habits" SET "icon" = CASE "icon"
  WHEN 'cup' THEN 'cup-soda'
  WHEN 'stretch' THEN 'person-standing'
  WHEN 'walk' THEN 'footprints'
  WHEN 'list' THEN 'list-checks'
  WHEN 'pen' THEN 'pen-line'
  WHEN 'book' THEN 'book-open'
  WHEN 'sparkle' THEN 'sparkles'
  WHEN 'phone' THEN 'smartphone'
  ELSE "icon"
END
WHERE "icon" IN ('cup', 'stretch', 'walk', 'list', 'pen', 'book', 'sparkle', 'phone');
