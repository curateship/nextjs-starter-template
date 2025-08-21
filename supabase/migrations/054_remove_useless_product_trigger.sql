-- Remove useless automatic product creation system completely
-- Date: August 21, 2025

-- Drop the trigger that automatically creates products (unnecessary complexity)
DROP TRIGGER IF EXISTS create_default_product_trigger ON sites;

-- Drop the function too since it's not needed
DROP FUNCTION IF EXISTS create_default_product_for_site(UUID);

-- Note: Users can create products manually when they need them
-- This eliminates unnecessary database magic and follows "simplicity first" principle