CREATE TABLE IF NOT EXISTS mail_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  domain VARCHAR(255) NOT NULL,
  provider VARCHAR(50) NOT NULL DEFAULT 'mxroute',
  status VARCHAR(30) NOT NULL DEFAULT 'setup_pending',
  dns_status JSONB NOT NULL DEFAULT '{}'::jsonb,
  provider_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mail_domains_site
  ON mail_domains(site_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mail_domains_site_domain
  ON mail_domains(site_id, domain);

CREATE INDEX IF NOT EXISTS idx_mail_domains_provider
  ON mail_domains(provider);

CREATE TABLE IF NOT EXISTS mailboxes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  mail_domain_id UUID NOT NULL REFERENCES mail_domains(id) ON DELETE CASCADE,
  local_part VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL,
  provider VARCHAR(50) NOT NULL DEFAULT 'mxroute',
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  quota_mb INTEGER NOT NULL DEFAULT 1024,
  usage_mb INTEGER NOT NULL DEFAULT 0,
  daily_send_limit INTEGER NOT NULL DEFAULT 9600,
  sent_today INTEGER NOT NULL DEFAULT 0,
  password_encrypted TEXT,
  provider_suspended BOOLEAN NOT NULL DEFAULT false,
  provider_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  disabled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mailboxes_site_email
  ON mailboxes(site_id, email);

CREATE INDEX IF NOT EXISTS idx_mailboxes_domain_status
  ON mailboxes(mail_domain_id, status);

CREATE INDEX IF NOT EXISTS idx_mailboxes_site_status
  ON mailboxes(site_id, status);
