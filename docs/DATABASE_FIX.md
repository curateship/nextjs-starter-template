# Database Fix for Product Features Block

## Issue
The Product Features block cannot be saved due to a database constraint that only allows 'product-hero' block types.

## Quick Fix (Run this SQL in Supabase Dashboard)

Go to your Supabase Dashboard > SQL Editor and run this query:

```sql
-- Update the database constraint to allow product-features block type
ALTER TABLE product_blocks 
DROP CONSTRAINT IF EXISTS product_blocks_block_type_check;

ALTER TABLE product_blocks 
ADD CONSTRAINT product_blocks_block_type_check 
CHECK (block_type IN ('product-hero', 'product-features'));
```

## Alternative Fix (Using the Migration Page)

1. Go to `/admin/migration` in your application
2. Click "Run Migration" button
3. This will attempt to update the constraint automatically

## Restoring Lost Content

If your hero block content was lost during the save attempt, you can:

1. Go back to the Product Builder
2. Add a new Product Hero block
3. Reconfigure your hero content

The data loss happened because the save operation fails midway through when it encounters the constraint violation.

## Prevention

After running the fix, the Product Features block will save successfully without affecting other blocks.