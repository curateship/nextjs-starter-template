-- Phase 2: Add user_id to product_orders for automatic account creation
-- This migration links product orders to user accounts created during lead magnet signup

-- Add user_id column with foreign key to auth.users
ALTER TABLE product_orders
ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Index for efficient user dashboard queries
-- "Show me all orders for this user"
CREATE INDEX idx_product_orders_user_id ON product_orders(user_id);

-- Composite index for cross-site user tracking
-- "Show me this user's orders from this specific site"
CREATE INDEX idx_product_orders_user_site ON product_orders(user_id, site_id);

-- Documentation
COMMENT ON COLUMN product_orders.user_id IS 'Links order to user account (auth.users). NULL for orders created before Phase 2 implementation or if user account is deleted. Enables cross-site user tracking - one user can have multiple orders from different sites.';
