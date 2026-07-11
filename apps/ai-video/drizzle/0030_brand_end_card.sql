ALTER TABLE "render_jobs"
  ADD COLUMN "include_end_card" boolean NOT NULL DEFAULT false;

ALTER TABLE "render_jobs"
  ALTER COLUMN "include_end_card" DROP DEFAULT;
