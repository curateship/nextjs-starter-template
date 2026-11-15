-- Networks hidden from a project's Networks block (Tyler, 14 Nov 2026: "i
-- should be able to hide and drag and drop networks here", of the block's ⋮).
-- A hidden network stays on the project and keeps running; only its line in
-- the left panel is left out. The order is the existing "networks" list.
ALTER TABLE "promo_projects" ADD COLUMN IF NOT EXISTS "hidden_networks" jsonb NOT NULL DEFAULT '[]'::jsonb;
