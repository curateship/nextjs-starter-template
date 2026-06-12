-- Adds the wire protocol to proxies (http | https | socks5). Distinct from "type"
-- (residential/mobile/datacenter, the network class) — protocol is what the
-- connection agent needs to actually route through the upstream proxy.
ALTER TABLE "proxies"
  ADD COLUMN IF NOT EXISTS "protocol" varchar(10) NOT NULL DEFAULT 'http';

-- Named CHECK, added idempotently so the migration can re-run safely.
DO $$ BEGIN
  ALTER TABLE "proxies"
    ADD CONSTRAINT "proxies_protocol_check"
    CHECK ("protocol" in ('http', 'https', 'socks5'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
