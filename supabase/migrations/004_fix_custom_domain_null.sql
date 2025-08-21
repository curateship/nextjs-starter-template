-- Allow empty strings and null values for custom_domain
-- This should fix the issue where clearing custom_domain fails to save

-- Drop the existing constraint
ALTER TABLE sites DROP CONSTRAINT IF EXISTS check_custom_domain_format;

-- Add more permissive constraint that allows null, empty string, and valid domains
ALTER TABLE sites ADD CONSTRAINT check_custom_domain_format 
    CHECK (
        custom_domain IS NULL 
        OR custom_domain = ''  -- Allow empty string
        OR custom_domain ~ '^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$'  -- Standard domain format
        OR custom_domain ~ '^[a-z0-9]([a-z0-9.-]*[a-z0-9])?:[0-9]{1,5}$'  -- Domain with port
        OR custom_domain = 'localhost'  -- Allow plain localhost
        OR custom_domain ~ '^localhost:[0-9]{1,5}$'  -- Allow localhost with port
    );