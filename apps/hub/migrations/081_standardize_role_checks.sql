-- Standardize RLS policies to use raw_app_meta_data for role checks
-- Change 'admin' role to 'super_admin' for consistency

-- Fix product_orders policies (currently using user_metadata, should use raw_app_meta_data)

-- Drop existing policies
DROP POLICY IF EXISTS "Allow admin access to all product orders" ON product_orders;
DROP POLICY IF EXISTS "Allow admin insert to product orders" ON product_orders;
DROP POLICY IF EXISTS "Allow admin update to product orders" ON product_orders;

-- Recreate with standardized role checks
CREATE POLICY "Allow super_admin access to all product orders"
ON product_orders FOR SELECT
USING (
    user_id = auth.uid() OR
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
);

CREATE POLICY "Allow super_admin insert to product orders"
ON product_orders FOR INSERT
WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
);

CREATE POLICY "Allow super_admin update to product orders"
ON product_orders FOR UPDATE
USING (
    user_id = auth.uid() OR
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
);

-- Note: Other tables (sites, pages, products, etc.) already use raw_app_meta_data
-- but use 'admin' role. These will work with 'super_admin' once users are assigned that role.
-- The RLS policies check for 'admin' OR ownership, so existing functionality is preserved.
