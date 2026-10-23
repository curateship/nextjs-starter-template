ALTER TABLE "categories"
  ADD COLUMN IF NOT EXISTS "meta_description" varchar(300) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "featured_image" varchar(600) NOT NULL DEFAULT '';
