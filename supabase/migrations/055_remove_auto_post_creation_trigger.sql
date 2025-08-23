-- Remove automatic post creation when sites are created
-- This prevents unwanted default posts from being created for new sites

-- Drop the trigger that creates default posts for new sites
DROP TRIGGER IF EXISTS create_default_post_trigger ON sites;

-- Drop the function that creates default posts
DROP FUNCTION IF EXISTS create_default_post_for_site();