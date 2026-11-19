-- The Dating dashboard's left page, one per profile (task
-- "features/07-three-panel-design", Tyler, 18 Nov 2026: "Revamp the dating
-- dashboard to the new 3 panel design patters"). The same shape as the
-- shell's automation_pages, keyed by profile: what is written on it, its
-- cover photo and the page's own cover pictures, its lock, the Overview's
-- widget layout, and the Dashboards block's hidden rows and order. A profile
-- with no row shows the starting blocks and widgets.
CREATE TABLE IF NOT EXISTS "date_pages" (
  "account_id" varchar(36) PRIMARY KEY NOT NULL REFERENCES "date_accounts"("id") ON DELETE CASCADE,
  "body" text NOT NULL DEFAULT '',
  "cover_url" text,
  "cover_images" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "locked" boolean NOT NULL DEFAULT false,
  "widgets" jsonb,
  "hidden_sections" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "section_order" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "updated_at" timestamp with time zone NOT NULL
);
