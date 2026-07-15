ALTER TABLE product_orders
  ADD COLUMN IF NOT EXISTS fulfillment_started_at timestamp with time zone;

WITH duplicate_sessions AS (
  SELECT id,
    row_number() OVER (PARTITION BY stripe_session_id ORDER BY created_at, id) AS duplicate_number
  FROM product_orders
  WHERE stripe_session_id IS NOT NULL
)
UPDATE product_orders
SET stripe_session_id = NULL
FROM duplicate_sessions
WHERE product_orders.id = duplicate_sessions.id
  AND duplicate_sessions.duplicate_number > 1;

WITH duplicate_intents AS (
  SELECT id,
    row_number() OVER (PARTITION BY stripe_payment_intent_id ORDER BY created_at, id) AS duplicate_number
  FROM product_orders
  WHERE stripe_payment_intent_id IS NOT NULL
)
UPDATE product_orders
SET stripe_payment_intent_id = NULL
FROM duplicate_intents
WHERE product_orders.id = duplicate_intents.id
  AND duplicate_intents.duplicate_number > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_orders_stripe_session_unique
  ON product_orders (stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_orders_stripe_payment_intent_unique
  ON product_orders (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;
