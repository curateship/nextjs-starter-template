ALTER TABLE "automations"
  ADD COLUMN IF NOT EXISTS "next_run_at" timestamptz;

CREATE INDEX IF NOT EXISTS "ix_automations_next_run"
  ON "automations" ("next_run_at")
  WHERE "next_run_at" IS NOT NULL;
