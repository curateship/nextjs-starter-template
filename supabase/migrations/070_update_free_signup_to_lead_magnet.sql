-- Update existing records from 'free_signup' to 'lead_magnet'
-- This must be in a separate migration because new enum values must be committed before use

UPDATE product_orders
SET order_type = 'lead_magnet'
WHERE order_type = 'free_signup';
