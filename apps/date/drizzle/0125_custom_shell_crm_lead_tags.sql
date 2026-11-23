-- Tags on a lead (CRM task 27, built in task 36, 7 Nov 2026): short labels
-- that say what kind of lead it is ("kitchen", "landlord"), beside the stage,
-- which says how far along it is. One row per tag, as member_tags keeps
-- them, so a tag is found by an index and goes with its lead. A new table,
-- so no existing row changes.
CREATE TABLE IF NOT EXISTS "crm_lead_tags" (
  "lead_id" varchar(36) NOT NULL REFERENCES "crm_leads"("id") ON DELETE CASCADE,
  "tag" varchar(60) NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  CONSTRAINT "crm_lead_tags_pk" PRIMARY KEY ("lead_id", "tag"),
  CONSTRAINT "crm_lead_tags_normalized_check" CHECK (
    "tag" = lower(trim("tag")) AND length("tag") BETWEEN 1 AND 60 AND position(',' in "tag") = 0
  )
);

CREATE INDEX IF NOT EXISTS "ix_crm_lead_tags_tag_lead" ON "crm_lead_tags" ("tag", "lead_id");
