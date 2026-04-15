CREATE TABLE site_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL DEFAULT 'member',
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  last_engaged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_site_memberships_site_user
  ON site_memberships(site_id, user_id);

CREATE INDEX idx_site_memberships_site_role
  ON site_memberships(site_id, role);

CREATE INDEX idx_site_memberships_site_status
  ON site_memberships(site_id, status);

CREATE INDEX idx_site_memberships_site_created
  ON site_memberships(site_id, created_at DESC, id);

CREATE INDEX idx_site_memberships_site_last_engaged
  ON site_memberships(site_id, last_engaged_at DESC, id);

INSERT INTO site_memberships (site_id, user_id, role, status, created_at, updated_at)
SELECT s.id, s.user_id, 'owner', 'active', s.created_at, now()
FROM sites s
ON CONFLICT (site_id, user_id) DO NOTHING;

INSERT INTO site_memberships (site_id, user_id, role, status, created_at, updated_at)
SELECT
  nc.site_id,
  u.id,
  'member',
  'active',
  COALESCE(nc.created_at, now()),
  now()
FROM newsletter_contacts nc
JOIN users u
  ON lower(u.email) = lower(nc.email)
WHERE COALESCE(nc.metadata->>'source', '') = 'site_registration'
ON CONFLICT (site_id, user_id) DO NOTHING;
