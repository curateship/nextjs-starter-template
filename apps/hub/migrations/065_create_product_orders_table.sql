-- Create product_orders table for tracking both free signups and paid purchases
-- This universal table handles all product deliveries with engagement tracking

-- Create enums for order classification
CREATE TYPE order_type_enum AS ENUM ('free_signup', 'paid_purchase');
CREATE TYPE payment_status_enum AS ENUM ('pending', 'succeeded', 'failed', 'canceled');

CREATE TABLE product_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,

  -- Customer information
  customer_email VARCHAR(255) NOT NULL,

  -- Order classification
  order_type order_type_enum NOT NULL,

  -- Payment info (nullable for free products)
  stripe_session_id VARCHAR(255),
  stripe_payment_intent_id VARCHAR(255),
  amount_total INTEGER,  -- Amount in cents
  currency VARCHAR(3),   -- ISO currency code (USD, EUR, etc.)
  payment_status payment_status_enum,

  -- Engagement tracking
  -- Unique token used for email link tracking
  access_token VARCHAR(255) UNIQUE NOT NULL,
  -- First click timestamp
  clicked_at TIMESTAMP WITH TIME ZONE,
  -- Total number of clicks (for analytics)
  click_count INTEGER DEFAULT 0,

  -- Integration tracking
  -- When email was sent
  email_sent_at TIMESTAMP WITH TIME ZONE,
  -- When added to Flodesk (or other email platform)
  flodesk_added_at TIMESTAMP WITH TIME ZONE,

  -- Additional metadata
  -- Store user agent, referrer, IP, custom data, etc.
  metadata JSONB,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for efficient queries

-- Basic lookup indexes
CREATE INDEX idx_product_orders_site_id ON product_orders(site_id);
CREATE INDEX idx_product_orders_product_id ON product_orders(product_id);
CREATE INDEX idx_product_orders_email ON product_orders(customer_email);
CREATE INDEX idx_product_orders_type ON product_orders(order_type);

-- Stripe lookup indexes
CREATE INDEX idx_product_orders_stripe_session ON product_orders(stripe_session_id) WHERE stripe_session_id IS NOT NULL;
CREATE INDEX idx_product_orders_stripe_payment_intent ON product_orders(stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL;

-- Access token lookup (for click tracking)
CREATE INDEX idx_product_orders_token ON product_orders(access_token);

-- Engagement analytics indexes
CREATE INDEX idx_product_orders_clicked ON product_orders(clicked_at) WHERE clicked_at IS NOT NULL;
CREATE INDEX idx_product_orders_email_sent ON product_orders(email_sent_at) WHERE email_sent_at IS NOT NULL;

-- Composite indexes for common query patterns
CREATE INDEX idx_product_orders_email_product ON product_orders(customer_email, product_id);
CREATE INDEX idx_product_orders_site_type ON product_orders(site_id, order_type);
CREATE INDEX idx_product_orders_site_created ON product_orders(site_id, created_at DESC);

-- Update updated_at timestamp on row update
CREATE TRIGGER update_product_orders_updated_at
  BEFORE UPDATE ON product_orders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE product_orders IS 'Universal table for tracking both free product signups and paid purchases with engagement metrics';
COMMENT ON COLUMN product_orders.order_type IS 'Distinguishes between free lead magnet signups and paid purchases';
COMMENT ON COLUMN product_orders.access_token IS 'Unique token used in email links for click tracking and Flodesk integration';
COMMENT ON COLUMN product_orders.click_count IS 'Total number of times user clicked tracked links (engagement metric)';
COMMENT ON COLUMN product_orders.metadata IS 'Additional data like user agent, referrer, UTM params, custom fields, etc.';
