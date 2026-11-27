-- A running flow can be paused and resumed (Tyler, 24 Nov 2026: "We need to
-- add a pause, start and stop to the automation").
--
-- `paused_at` is set while the flow is paused: it stays live, but nobody in
-- it, or in a sequence it started, takes another step until it is resumed.
-- `paused_by` is the admin who pressed Pause, shown on the right panel.
ALTER TABLE "automations" ADD COLUMN IF NOT EXISTS "paused_at" timestamp with time zone;
ALTER TABLE "automations" ADD COLUMN IF NOT EXISTS "paused_by" varchar(36)
  REFERENCES "users"("id") ON DELETE SET NULL;

-- The background pass asks, for every run it is about to take, whether a
-- paused flow holds it. Almost no flow is paused, so this index is nearly
-- always empty and the answer costs nothing.
CREATE INDEX IF NOT EXISTS "ix_automations_paused"
  ON "automations" ("paused_at") WHERE "paused_at" IS NOT NULL;
