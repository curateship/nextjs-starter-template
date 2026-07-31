-- Abandoned checkout recovery: one polite follow-up email for paid product
-- checkouts that were started but never finished. A product_orders row with
-- payment_status = 'pending' is exactly that (the Stripe webhook writes it when
-- a checkout session completes unpaid); nothing read those rows before this.
--
-- The single sent-at stamp is the whole send-once guarantee: the cron only
-- picks rows where it is NULL and only stamps it after a successful send, so
-- running the job twice can never email anyone twice.

ALTER TABLE product_orders ADD COLUMN IF NOT EXISTS recovery_email_sent_at TIMESTAMPTZ;

-- Candidate lookup for the cron: unpaid paid-purchase orders not yet emailed.
-- Partial, so it stays tiny — succeeded orders and already-emailed rows drop out.
CREATE INDEX IF NOT EXISTS idx_product_orders_recovery_pending
  ON product_orders (created_at)
  WHERE order_type = 'paid_purchase'
    AND payment_status = 'pending'
    AND recovery_email_sent_at IS NULL;

-- Editable transactional template for the recovery email.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'system_email_template_key_enum') THEN
    ALTER TYPE system_email_template_key_enum ADD VALUE IF NOT EXISTS 'abandoned_checkout_recovery';
  END IF;
END $$;

-- Register with the unified cron runner. Hourly is plenty for a follow-up
-- measured in days.
INSERT INTO cron_jobs (name, endpoint, schedule, enabled)
SELECT 'Checkout recovery', '/api/cron/checkout-recovery', '0 * * * *', true
WHERE NOT EXISTS (SELECT 1 FROM cron_jobs WHERE endpoint = '/api/cron/checkout-recovery');
