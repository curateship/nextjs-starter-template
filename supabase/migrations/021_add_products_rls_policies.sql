-- Add Row Level Security policies for products table
-- This migration secures the products table to prevent unauthorized access

-- Enable RLS on products table to enforce access control
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view products from their own sites
CREATE POLICY "Users can view their own site products" ON products
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM sites 
            WHERE sites.id = products.site_id 
            AND sites.user_id = auth.uid()
        )
    );

-- Policy: Users can create products for their own sites
CREATE POLICY "Users can create products for their sites" ON products
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM sites 
            WHERE sites.id = products.site_id 
            AND sites.user_id = auth.uid()
        )
    );

-- Policy: Users can update products for their own sites
CREATE POLICY "Users can update their site products" ON products
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM sites 
            WHERE sites.id = products.site_id 
            AND sites.user_id = auth.uid()
        )
    );

-- Policy: Users can delete products from their own sites
CREATE POLICY "Users can delete their site products" ON products
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM sites 
            WHERE sites.id = products.site_id 
            AND sites.user_id = auth.uid()
        )
    );

-- Policy: Public users can view published products (for frontend display)
-- This allows the frontend to display published products without authentication
CREATE POLICY "Public can view published products" ON products
    FOR SELECT USING (is_published = true);

-- Policy: Admins have full access to all products
CREATE POLICY "Admins can manage all products" ON products
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM auth.users 
            WHERE auth.users.id = auth.uid() 
            AND auth.users.raw_app_meta_data->>'role' = 'admin'
        )
    );