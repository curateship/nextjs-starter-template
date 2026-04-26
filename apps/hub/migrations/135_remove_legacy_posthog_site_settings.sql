-- Remove legacy PostHog keys from site settings.
-- HUB now uses its internal analytics tracker instead.

UPDATE sites
SET settings = settings - 'posthog_api_key' - 'posthog_host'
WHERE settings ? 'posthog_api_key'
  OR settings ? 'posthog_host';
