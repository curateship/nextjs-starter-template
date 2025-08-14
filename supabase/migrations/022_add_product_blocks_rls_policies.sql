-- Add Row Level Security policies for product_blocks table
-- This migration secures the product_blocks table to prevent unauthorized access

-- Enable RLS on product_blocks table to enforce access control
ALTER TABLE product_blocks ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view product blocks for products they own via site ownership
CREATE POLICY "Users can view their product blocks" ON product_blocks
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM products p
            JOIN sites s ON s.id = p.site_id
            WHERE p.id = product_blocks.product_id 
            AND s.user_id = auth.uid()
        )
    );

-- Policy: Users can create product blocks for their own products
CREATE POLICY "Users can create product blocks" ON product_blocks
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM products p
            JOIN sites s ON s.id = p.site_id
            WHERE p.id = product_blocks.product_id 
            AND s.user_id = auth.uid()
        )
    );

-- Policy: Users can update product blocks for their own products
CREATE POLICY "Users can update their product blocks" ON product_blocks
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM products p
            JOIN sites s ON s.id = p.site_id
            WHERE p.id = product_blocks.product_id 
            AND s.user_id = auth.uid()
        )
    );

-- Policy: Users can delete product blocks for their own products
CREATE POLICY "Users can delete their product blocks" ON product_blocks
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM products p
            JOIN sites s ON s.id = p.site_id
            WHERE p.id = product_blocks.product_id 
            AND s.user_id = auth.uid()
        )
    );

-- Policy: Public can view active product blocks for published products
CREATE POLICY "Public can view active blocks for published products" ON product_blocks
    FOR SELECT USING (
        is_active = true AND
        EXISTS (
            SELECT 1 FROM products p
            WHERE p.id = product_blocks.product_id 
            AND p.is_published = true
        )
    );

-- Policy: Admins have full access to all product blocks
CREATE POLICY "Admins can manage all product blocks" ON product_blocks
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM auth.users 
            WHERE auth.users.id = auth.uid() 
            AND auth.users.raw_app_meta_data->>'role' = 'admin'
        )
    );