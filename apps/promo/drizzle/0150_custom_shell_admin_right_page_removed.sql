-- The Admin dashboard's Overview lost its right panel, the Notes page
-- (Tyler, 8 Nov 2026, workspace/tasks/fixes.md: "Remove the right panel for
-- overview dashboard"). Its stored rows go with it. Only the left page is
-- read or written from here on; the side column and its check stay, so the
-- table needs no other change.

DELETE FROM "admin_pages" WHERE "side" = 'right';
