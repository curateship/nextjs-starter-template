CREATE TABLE IF NOT EXISTS "keyword_ranking_alerts" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "project_id" varchar(36) NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "keyword_id" varchar(36) NOT NULL REFERENCES "keywords"("id") ON DELETE CASCADE,
  "type" text NOT NULL,
  "previous_position" integer,
  "new_position" integer,
  "delta" integer,
  "keyword_snapshot" text NOT NULL,
  "read_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "keyword_ranking_alerts_type_check" CHECK (
    "type" in ('new_ranking', 'lost_ranking', 'entered_top_10', 'left_top_10', 'big_gain', 'big_drop')
  )
);

CREATE INDEX IF NOT EXISTS "idx_keyword_ranking_alerts_project_created"
  ON "keyword_ranking_alerts" ("project_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_keyword_ranking_alerts_project_read"
  ON "keyword_ranking_alerts" ("project_id", "read_at");

-- The SEO sidebar section is owned authoritatively by migration 0009 (the
-- latest to add a nav item). Migrations run in full order on every start, so
-- 0009 rewrites the section after this one; there is no need to touch nav here.
