-- Drop the post_blocks table as it's no longer needed
-- Posts now use content_blocks JSON column for storing content

DROP TABLE IF EXISTS post_blocks;