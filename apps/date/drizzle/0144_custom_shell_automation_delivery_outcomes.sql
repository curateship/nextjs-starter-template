-- Each automation or sequence email keeps what became of it, so a sequence can
-- count bounces, complaints and unsubscribes per email (Tyler, 22 Nov 2026:
-- "there's no statistics at all"). Before this the bounce or complaint only
-- reached the contact, and an unsubscribe was never tied to an email.
ALTER TABLE "automation_deliveries" ADD COLUMN IF NOT EXISTS "bounced_at" timestamp with time zone;
ALTER TABLE "automation_deliveries" ADD COLUMN IF NOT EXISTS "complained_at" timestamp with time zone;
ALTER TABLE "automation_deliveries" ADD COLUMN IF NOT EXISTS "unsubscribed_at" timestamp with time zone;
