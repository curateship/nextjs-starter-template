DELETE FROM cron_jobs
WHERE endpoint = '/api/cron/engagement';

DROP INDEX IF EXISTS idx_newsletter_contacts_site_engagement;

ALTER TABLE newsletter_contacts
  DROP COLUMN IF EXISTS engagement_score;
