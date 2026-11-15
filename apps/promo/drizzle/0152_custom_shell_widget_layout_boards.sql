-- Widget layouts for more than one dashboard (Tyler, 8 Nov 2026: "We need to
-- get the CRM dashboard up to date with the new admin dashboard. We dont have
-- any CRM widgets so lets leave it empty for now"). Each site keeps one
-- layout per dashboard: 'admin' for the Admin dashboard's Overview, 'crm' for
-- the CRM's. Every row already stored is the Admin one, which the default
-- says. The table keeps its name.

ALTER TABLE "admin_widget_layouts" ADD COLUMN IF NOT EXISTS "board" varchar(20) NOT NULL DEFAULT 'admin';
ALTER TABLE "admin_widget_layouts" DROP CONSTRAINT IF EXISTS "admin_widget_layouts_pkey";
ALTER TABLE "admin_widget_layouts" ADD CONSTRAINT "admin_widget_layouts_pkey" PRIMARY KEY ("workspace_id", "board");
