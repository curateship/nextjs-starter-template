-- The Admin dashboard's two pages, one of each per site (Tyler, 8 Nov 2026,
-- workspace/tasks/features/admin/admin.md): the left page beside every tab and
-- the right page beside Overview, each a page of "/" blocks with its own cover
-- photo and lock. New table only; nothing existing changes.

CREATE TABLE IF NOT EXISTS "admin_pages" (
  "workspace_id" varchar(36) NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "side" varchar(8) NOT NULL,
  "body" text NOT NULL DEFAULT '',
  "cover_url" text,
  "locked" boolean NOT NULL DEFAULT false,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "admin_pages_pkey" PRIMARY KEY ("workspace_id", "side"),
  CONSTRAINT "admin_pages_side_check" CHECK ("side" IN ('left', 'right'))
);
