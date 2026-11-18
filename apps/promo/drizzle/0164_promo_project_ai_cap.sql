-- A project's monthly AI spend cap, in whole cents, from AI spend cap in the
-- project's ⋮ (part 2 of workspace/tasks/New features/new-features-18-nov.md).
-- Null is no cap, which every project made before this has.
ALTER TABLE "promo_projects" ADD COLUMN IF NOT EXISTS "ai_cap_cents" integer;
