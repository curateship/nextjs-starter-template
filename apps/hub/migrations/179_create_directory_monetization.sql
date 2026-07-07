DO $$ BEGIN
  CREATE TYPE directory_featured_entitlement_status_enum AS ENUM ('active', 'revoked');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS directory_featured_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  description TEXT,
  stripe_price_id VARCHAR(255) NOT NULL,
  duration_days INTEGER NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_directory_featured_plans_site_active
  ON directory_featured_plans(site_id, is_active, display_order);

CREATE TABLE IF NOT EXISTS directory_featured_entitlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  directory_id UUID NOT NULL REFERENCES directory(id) ON DELETE CASCADE,
  claim_id UUID NOT NULL REFERENCES directory_claims(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES directory_featured_plans(id) ON DELETE RESTRICT,
  stripe_session_id VARCHAR(255),
  stripe_payment_intent_id VARCHAR(255),
  amount_total INTEGER,
  currency VARCHAR(10),
  status directory_featured_entitlement_status_enum NOT NULL DEFAULT 'active',
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  revoked_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  revoked_at TIMESTAMPTZ,
  revoke_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_directory_featured_entitlements_session
  ON directory_featured_entitlements(stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_directory_featured_entitlements_payment_intent
  ON directory_featured_entitlements(stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_directory_featured_entitlements_directory_status
  ON directory_featured_entitlements(directory_id, status, ends_at);
CREATE INDEX IF NOT EXISTS idx_directory_featured_entitlements_site_status_created
  ON directory_featured_entitlements(site_id, status, created_at DESC, id);

ALTER TABLE hub_notifications DROP CONSTRAINT IF EXISTS hub_notifications_type_check;
ALTER TABLE hub_notifications ADD CONSTRAINT hub_notifications_type_check
  CHECK (type IN ('product_order', 'directory_claim', 'directory_owner_edit', 'directory_featured', 'newsletter_paused'));
