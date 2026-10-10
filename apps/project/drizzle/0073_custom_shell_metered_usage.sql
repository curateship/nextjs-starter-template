ALTER TABLE "plans"
  ADD COLUMN IF NOT EXISTS "usage_meter" varchar(100);

CREATE TABLE IF NOT EXISTS "usage_events" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "user_id" varchar(36),
  "meter" varchar(100) NOT NULL,
  "quantity" bigint NOT NULL,
  "occurred_at" timestamp with time zone NOT NULL,
  "stripe_customer_id" varchar(120),
  "stripe_report_status" varchar(20) DEFAULT 'not_applicable' NOT NULL,
  "stripe_report_error" varchar(120),
  "stripe_reported_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'usage_events_quantity_check'
  ) THEN
    ALTER TABLE "usage_events"
      ADD CONSTRAINT "usage_events_quantity_check" CHECK ("quantity" > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'usage_events_stripe_status_check'
  ) THEN
    ALTER TABLE "usage_events"
      ADD CONSTRAINT "usage_events_stripe_status_check"
      CHECK ("stripe_report_status" IN ('not_applicable', 'pending', 'reported', 'failed'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'usage_events_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "usage_events"
      ADD CONSTRAINT "usage_events_user_id_users_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "ix_usage_events_user_occurred"
  ON "usage_events" ("user_id", "occurred_at" DESC);

CREATE INDEX IF NOT EXISTS "ix_usage_events_meter_occurred"
  ON "usage_events" ("meter", "occurred_at" DESC);

CREATE INDEX IF NOT EXISTS "ix_usage_events_occurred"
  ON "usage_events" ("occurred_at" DESC);

CREATE INDEX IF NOT EXISTS "ix_usage_events_pending_customer"
  ON "usage_events" ("stripe_customer_id", "occurred_at")
  WHERE "stripe_report_status" = 'pending';

CREATE INDEX IF NOT EXISTS "ix_usage_events_reports_to_review"
  ON "usage_events" ("stripe_report_status", "meter")
  WHERE "stripe_report_status" IN ('pending', 'failed');
