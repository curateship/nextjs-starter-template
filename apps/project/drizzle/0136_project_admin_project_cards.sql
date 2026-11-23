-- The Projects card on the site admin's My dashboard (task "My dashboard/01
-- Project cards", Tyler, 29 Oct 2026): the projects they hid from it, and the
-- order they dragged its projects into. Both are theirs alone. An empty order
-- is the usual one: late projects first.
ALTER TABLE "project_site_admin_prefs"
  ADD COLUMN IF NOT EXISTS "hidden_project_ids" text[] NOT NULL DEFAULT '{}';
ALTER TABLE "project_site_admin_prefs"
  ADD COLUMN IF NOT EXISTS "project_order" text[] NOT NULL DEFAULT '{}';
