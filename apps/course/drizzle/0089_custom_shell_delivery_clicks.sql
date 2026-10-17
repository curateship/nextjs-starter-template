-- Whether a newsletter was clicked.
--
-- Automation mail has recorded clicks in its own table all along; newsletters
-- recorded neither clicks nor opens until the previous migration added the
-- open. Without this, "when they last opened or clicked" would quietly mean
-- "opened" for anybody whose mail is newsletters, and a click is the stronger
-- of the two signals: an open is a hidden image a mail client can block, while
-- a click cannot happen by accident.
ALTER TABLE "deliveries"
  ADD COLUMN IF NOT EXISTS "clicked_at" timestamp with time zone;

-- "Has this person opened or clicked anything since…", asked once per contact
-- by the two engagement rules. Partial, because the rows worth looking at are
-- the small fraction that were opened or clicked, and a full index over every
-- send ever made would be mostly nulls.
CREATE INDEX IF NOT EXISTS "ix_deliveries_workspace_engaged"
  ON "deliveries" ("workspace_id", "contact_id")
  WHERE "opened_at" IS NOT NULL OR "clicked_at" IS NOT NULL;
