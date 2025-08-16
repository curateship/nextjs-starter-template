-- Add rich text field to products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS rich_text TEXT;