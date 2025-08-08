-- Remove unused features from theme metadata to reduce tech debt
-- Features were stored in metadata.features but are no longer needed

-- Remove features key from all themes metadata
UPDATE themes 
SET metadata = metadata - 'features'
WHERE metadata ? 'features';

-- Clean up any other unused keys that might exist
-- You can add more keys here if found during cleanup
UPDATE themes 
SET metadata = COALESCE(metadata, '{}')
WHERE metadata IS NULL;