CREATE TABLE IF NOT EXISTS "hub_notifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "recipient_user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
  "type" varchar(50) NOT NULL,
  "source_id" uuid NOT NULL,
  "title" varchar(255) NOT NULL,
  "message" text NOT NULL,
  "target_href" text NOT NULL,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "read_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "hub_notifications_type_check" CHECK ("type" in ('product_order', 'directory_claim', 'newsletter_paused'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_hub_notifications_recipient_type_source"
  ON "hub_notifications" ("recipient_user_id", "type", "source_id");

CREATE INDEX IF NOT EXISTS "idx_hub_notifications_recipient_created"
  ON "hub_notifications" ("recipient_user_id", "created_at" DESC, "id");

CREATE INDEX IF NOT EXISTS "idx_hub_notifications_site_created"
  ON "hub_notifications" ("site_id", "created_at" DESC);
