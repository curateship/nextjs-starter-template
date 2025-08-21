-- Fix custom domain constraint to allow localhost with port numbers
-- This enables localhost:3000 and other port-based domains for development

-- Drop the existing constraint
ALTER TABLE sites DROP CONSTRAINT IF EXISTS check_custom_domain_format;

-- Add updated constraint that allows colons for port numbers
ALTER TABLE sites ADD CONSTRAINT check_custom_domain_format 
    CHECK (
        custom_domain IS NULL 
        OR custom_domain ~ '^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$'  -- Standard domain format
        OR custom_domain ~ '^[a-z0-9]([a-z0-9.-]*[a-z0-9])?:[0-9]{1,5}$'  -- Domain with port
        OR custom_domain = 'localhost'  -- Allow plain localhost
        OR custom_domain ~ '^localhost:[0-9]{1,5}$'  -- Allow localhost with port
    );