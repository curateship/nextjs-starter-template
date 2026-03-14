ALTER TABLE email_automation_steps ADD COLUMN IF NOT EXISTS content_blocks JSONB DEFAULT '{}'::jsonb;
