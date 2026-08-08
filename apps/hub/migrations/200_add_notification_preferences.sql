-- Notification preferences: each admin can switch individual kinds of tray
-- notification off, per site. The sender only reads rows to MUTE someone —
-- a missing row always means "send it" — so nobody has rows created for them,
-- nothing goes quiet by accident, and a kind added later is on for everyone.

CREATE TABLE IF NOT EXISTS hub_notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT hub_notification_preferences_type_check CHECK (
    type IN (
      'product_order',
      'directory_claim',
      'directory_owner_edit',
      'directory_featured',
      'newsletter_paused',
      'directory_featured_expired',
      'event_submission',
      'directory_submission',
      'event_registration',
      'automation_approval'
    )
  )
);

-- One row per person, site, and kind; also the settings screen's read path.
CREATE UNIQUE INDEX IF NOT EXISTS idx_hub_notification_preferences_user_site_type
  ON hub_notification_preferences (user_id, site_id, type);

-- The sender looks up "who muted this kind on this site" on every notification.
CREATE INDEX IF NOT EXISTS idx_hub_notification_preferences_site_type
  ON hub_notification_preferences (site_id, type)
  WHERE NOT enabled;
