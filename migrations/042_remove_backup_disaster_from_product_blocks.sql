-- Remove the backup/restore disaster columns from product_blocks table
-- Following CLAUDE.md: "NEVER create backup/restore systems in application code"

-- Drop dependent triggers and functions first
DROP TRIGGER IF EXISTS update_product_blocks_soft_delete ON product_blocks;
DROP FUNCTION IF EXISTS update_product_blocks_deleted_at();
DROP FUNCTION IF EXISTS cleanup_old_product_blocks();

-- Drop indexes that depend on disaster columns
DROP INDEX IF EXISTS idx_product_blocks_cleanup;
DROP INDEX IF EXISTS idx_product_blocks_backup_ref;

-- Remove the disaster columns
ALTER TABLE product_blocks DROP COLUMN IF EXISTS deleted_at;
ALTER TABLE product_blocks DROP COLUMN IF EXISTS restored_from_backup;
ALTER TABLE product_blocks DROP COLUMN IF EXISTS backup_reference;

-- Note: product_blocks now follows the same clean pattern as page_blocks
-- Simple CRUD operations: Load → Edit → Save → Delete (no staging, no backups, no fake safety)