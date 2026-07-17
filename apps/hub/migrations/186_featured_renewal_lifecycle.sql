-- Featured listing renewal & expiry lifecycle.
-- Adds a durable 'expired' entitlement status (flipped by the featured-renewals cron),
-- a per-entitlement reminder-dedupe column, the renewal-reminder system email template key,
-- and a new admin hub-notification type fired when a placement expires.

-- 1. Durable expired status for featured entitlements. Expiry was previously only
--    derived at read time; the cron now persists it so the transition is a real event.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'directory_featured_entitlement_status_enum') THEN
    ALTER TYPE directory_featured_entitlement_status_enum ADD VALUE IF NOT EXISTS 'expired';
  END IF;
END $$;

-- 2. Smallest reminder threshold (in days) already emailed for this entitlement, so
--    each configured threshold sends exactly one renewal reminder. NULL = none sent yet.
ALTER TABLE directory_featured_entitlements
  ADD COLUMN IF NOT EXISTS reminder_threshold_days INTEGER;

-- 3. Renewal-reminder system email template key (site-scoped).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'system_email_template_key_enum') THEN
    ALTER TYPE system_email_template_key_enum ADD VALUE IF NOT EXISTS 'featured_listing_renewal_reminder';
  END IF;
END $$;

-- 4. Allow the new expiry hub-notification type (kept distinct from 'directory_featured'
--    so an expiry notice is not deduped against the original purchase notice).
ALTER TABLE hub_notifications DROP CONSTRAINT IF EXISTS hub_notifications_type_check;
ALTER TABLE hub_notifications ADD CONSTRAINT hub_notifications_type_check
  CHECK (type IN ('product_order', 'directory_claim', 'directory_owner_edit', 'directory_featured', 'newsletter_paused', 'directory_featured_expired'));
