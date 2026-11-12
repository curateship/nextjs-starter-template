-- Overview's widgets on the Admin dashboard, one layout per site (Tyler,
-- 8 Nov 2026, workspace/tasks/admin-changes.md): up to two rows, each with
-- its own number of columns, each column holding one widget or nothing. A
-- site with no row here shows the default layout. New table only; nothing
-- existing changes.

CREATE TABLE IF NOT EXISTS "admin_widget_layouts" (
  "workspace_id" varchar(36) PRIMARY KEY REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "layout" jsonb NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);
