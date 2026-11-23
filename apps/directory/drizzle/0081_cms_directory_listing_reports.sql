-- Problems visitors spot on a listing.
--
-- A report is a tip-off, never a change. It is never shown to the public, it
-- never edits the listing it is about, and it needs no account — the visitor
-- who drove to a bakery the site said was open on Sunday has no account and is
-- the person most likely to know.
--
-- `reporter_email` is optional and is there so an admin can ask a follow-up
-- question by hand. Nothing is ever sent to it automatically.
CREATE TABLE IF NOT EXISTS "directory_listing_reports" (
  "id" varchar(36) PRIMARY KEY,
  -- Deleting a site deletes its reports.
  "workspace_id" varchar(36) NOT NULL
    REFERENCES "workspaces"("id") ON DELETE CASCADE,
  -- Deleting a listing deletes its reports. A report about a page that no
  -- longer exists is a row nobody can act on.
  "listing_id" varchar(36) NOT NULL
    REFERENCES "directory_listings"("id") ON DELETE CASCADE,
  -- Which of the fixed reasons the visitor picked.
  "reason" varchar(30) NOT NULL,
  "note" varchar(1000) NOT NULL DEFAULT '',
  -- Empty when they did not give one, which is most of the time.
  "reporter_email" varchar(255) NOT NULL DEFAULT '',
  "status" varchar(20) NOT NULL DEFAULT 'open',
  "closed_by_user_id" varchar(36)
    REFERENCES "users"("id") ON DELETE SET NULL,
  "closed_at" timestamptz,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  CONSTRAINT "directory_listing_reports_reason_check"
    CHECK ("reason" IN ('wrong_hours', 'wrong_contact', 'closed', 'other')),
  CONSTRAINT "directory_listing_reports_status_check"
    CHECK ("status" IN ('open', 'fixed', 'dismissed'))
);

-- The queue reads one site's open reports and nothing else.
CREATE INDEX IF NOT EXISTS "ix_directory_listing_reports_workspace_status"
  ON "directory_listing_reports" ("workspace_id", "status");

-- Newest first within a site, which is the order the queue is drawn in.
CREATE INDEX IF NOT EXISTS "ix_directory_listing_reports_workspace_created"
  ON "directory_listing_reports" ("workspace_id", "created_at");

CREATE INDEX IF NOT EXISTS "ix_directory_listing_reports_listing"
  ON "directory_listing_reports" ("listing_id");
