-- Enhanced safety features for product_blocks table
-- Adds soft delete tracking and cleanup mechanisms

-- Add columns to track soft deletes and restore operations
ALTER TABLE product_blocks 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
ADD COLUMN IF NOT EXISTS restored_from_backup BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS backup_reference UUID DEFAULT NULL;

-- Create index for cleanup operations (find old inactive blocks)
CREATE INDEX IF NOT EXISTS idx_product_blocks_cleanup 
ON product_blocks(deleted_at, is_active) WHERE is_active = false;

-- Create index for backup operations
CREATE INDEX IF NOT EXISTS idx_product_blocks_backup_ref 
ON product_blocks(backup_reference) WHERE backup_reference IS NOT NULL;

-- Update the trigger to also update deleted_at when marking as inactive
CREATE OR REPLACE FUNCTION update_product_blocks_deleted_at()
RETURNS TRIGGER AS $$
BEGIN
    -- If marking as inactive, set deleted_at
    IF NEW.is_active = FALSE AND OLD.is_active = TRUE THEN
        NEW.deleted_at = NOW();
    END IF;
    
    -- If marking as active, clear deleted_at
    IF NEW.is_active = TRUE AND OLD.is_active = FALSE THEN
        NEW.deleted_at = NULL;
    END IF;
    
    -- Update updated_at timestamp
    NEW.updated_at = NOW();
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for soft delete tracking
DROP TRIGGER IF EXISTS update_product_blocks_soft_delete ON product_blocks;
CREATE TRIGGER update_product_blocks_soft_delete
    BEFORE UPDATE ON product_blocks
    FOR EACH ROW
    EXECUTE FUNCTION update_product_blocks_deleted_at();

-- Create function to clean up old inactive blocks (older than 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_product_blocks()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Delete blocks that have been inactive for more than 30 days
    DELETE FROM product_blocks 
    WHERE is_active = FALSE 
    AND deleted_at < NOW() - INTERVAL '30 days'
    AND restored_from_backup = FALSE; -- Don't delete backup references
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Create a view for active blocks only (for easier queries)
CREATE OR REPLACE VIEW active_product_blocks AS
SELECT * FROM product_blocks 
WHERE is_active = true 
ORDER BY display_order;