-- Add is_default flag to newsletter templates
ALTER TABLE newsletter_templates ADD COLUMN is_default boolean NOT NULL DEFAULT false;
