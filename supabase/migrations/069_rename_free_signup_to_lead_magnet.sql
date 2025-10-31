-- Add 'lead_magnet' as a new enum value to order_type_enum
-- This provides clearer, more specific terminology for lead magnet signups
-- Note: Existing records will be updated in a follow-up migration (070)

ALTER TYPE order_type_enum ADD VALUE IF NOT EXISTS 'lead_magnet';

-- Documentation
COMMENT ON TYPE order_type_enum IS 'Order classification: lead_magnet (free product signup with email delivery) or paid_purchase (Stripe payment required)';
