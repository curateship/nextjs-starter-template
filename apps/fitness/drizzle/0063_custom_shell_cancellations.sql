CREATE TABLE "cancellations" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "plan_id" varchar(36) REFERENCES "plans"("id") ON DELETE SET NULL,
  "plan_name" varchar(120),
  "reason" varchar(40),
  "feedback" varchar(500),
  "ends_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  CONSTRAINT "cancellations_reason_check" CHECK (
    "reason" IS NULL OR "reason" IN (
      'too_expensive',
      'missing_features',
      'hard_to_use',
      'not_using_enough',
      'temporary',
      'other'
    )
  )
);
--> statement-breakpoint
CREATE INDEX "ix_cancellations_user_created"
  ON "cancellations" ("user_id", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX "ix_cancellations_ends_at" ON "cancellations" ("ends_at");
