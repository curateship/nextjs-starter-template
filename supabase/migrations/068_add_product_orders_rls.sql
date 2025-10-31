-- Add RLS policies for product_orders table
-- Users should be able to view their own orders

-- Enable RLS on product_orders
ALTER TABLE product_orders ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own orders
-- Matches user_id in product_orders to authenticated user's ID
CREATE POLICY "Users can view their own orders"
  ON product_orders
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Admins can view all orders
-- Admins have full read access for management and analytics
CREATE POLICY "Admins can view all orders"
  ON product_orders
  FOR SELECT
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  );

-- Policy: Admins can update all orders
-- Needed for admin management features
CREATE POLICY "Admins can update all orders"
  ON product_orders
  FOR UPDATE
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  );

-- Policy: Admins can delete orders
CREATE POLICY "Admins can delete orders"
  ON product_orders
  FOR DELETE
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  );

-- Policy: Service role can do anything (for server-side operations)
-- This policy allows backend services to create/update orders
-- No explicit policy needed as service role bypasses RLS

-- Documentation
COMMENT ON POLICY "Users can view their own orders" ON product_orders IS
  'Allows authenticated users to view orders linked to their user_id. Used for user dashboard to show their lead magnets.';

COMMENT ON POLICY "Admins can view all orders" ON product_orders IS
  'Gives admins full visibility into all orders for management and analytics purposes.';
