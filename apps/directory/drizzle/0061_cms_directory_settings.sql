ALTER TABLE "directory_settings"
  ADD COLUMN IF NOT EXISTS "page_size" integer,
  ADD COLUMN IF NOT EXISTS "default_sort" varchar(20),
  ADD COLUMN IF NOT EXISTS "browse_title" varchar(120),
  ADD COLUMN IF NOT EXISTS "browse_intro" varchar(500),
  ADD COLUMN IF NOT EXISTS "featured_first" boolean;
