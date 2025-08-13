-- Create product blocks system for storing product page content blocks
-- This enables the Product Builder to save and retrieve block content for products

-- Create product_blocks table to store block content for each product
CREATE TABLE IF NOT EXISTS product_blocks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    block_type VARCHAR(50) NOT NULL CHECK (block_type IN ('product-hero')),
    content JSONB NOT NULL DEFAULT '{}',
    display_order INTEGER NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_product_blocks_product_id ON product_blocks(product_id);
CREATE INDEX IF NOT EXISTS idx_product_blocks_type ON product_blocks(block_type);
CREATE INDEX IF NOT EXISTS idx_product_blocks_active ON product_blocks(is_active) WHERE is_active = true;

-- Create composite index for common query patterns
CREATE INDEX IF NOT EXISTS idx_product_blocks_product_active ON product_blocks(product_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_product_blocks_product_order ON product_blocks(product_id, display_order);

-- Create updated_at trigger
CREATE TRIGGER update_product_blocks_updated_at BEFORE UPDATE ON product_blocks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();