-- Add front-facing profile fields to users for the account "Core" block.
-- Quoted camelCase matches the better-auth table convention ("displayName", "banReason").
ALTER TABLE users ADD COLUMN IF NOT EXISTS "bio" TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "socialLinks" JSONB NOT NULL DEFAULT '[]'::jsonb;
