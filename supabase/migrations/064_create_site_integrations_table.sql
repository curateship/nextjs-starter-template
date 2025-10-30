-- Create site_integrations table for managing third-party integrations per site
-- This table supports any integration type (Flodesk, ConvertKit, Mailchimp, etc.)
-- using a flexible JSONB config column

CREATE TABLE site_integrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,

  -- Integration type: 'flodesk', 'convertkit', 'mailchimp', 'resend', etc.
  integration_type VARCHAR(50) NOT NULL,

  -- Flexible JSON config for integration-specific settings
  -- Examples:
  --   Flodesk: { "api_key": "fk_xxx", "segment_id": "seg_xxx" }
  --   ConvertKit: { "api_key": "ck_xxx", "form_id": "123" }
  --   Resend: { "api_key": "re_xxx", "from_email": "hello@custom.com", "from_name": "Brand" }
  config JSONB NOT NULL,

  -- Enable/disable integration without deleting config
  is_enabled BOOLEAN DEFAULT true,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Ensure one integration type per site
  UNIQUE(site_id, integration_type)
);

-- Indexes for efficient queries
CREATE INDEX idx_site_integrations_site_id ON site_integrations(site_id);
CREATE INDEX idx_site_integrations_type ON site_integrations(integration_type);
CREATE INDEX idx_site_integrations_enabled ON site_integrations(site_id, is_enabled) WHERE is_enabled = true;

-- Update updated_at timestamp on row update
CREATE TRIGGER update_site_integrations_updated_at
  BEFORE UPDATE ON site_integrations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add comment for documentation
COMMENT ON TABLE site_integrations IS 'Stores third-party integration configurations for each site (email marketing, analytics, webhooks, etc.)';
COMMENT ON COLUMN site_integrations.config IS 'JSONB configuration specific to each integration type. Structure varies by integration_type.';
