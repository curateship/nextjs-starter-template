-- Guests sent from Project (Connected apps task 01, Tyler, 19 Oct 2026).
-- Somebody on a Project task presses "Edit video", Project stamps a note
-- that works once within 60 seconds, and Video signs them in to that one
-- video project for 12 hours. They have no Video account.
--
-- Every note's one-time id is kept here once used, so a copied address
-- fails. The row is written in the same transaction as the guest sign-in,
-- and the primary key refuses a second copy, so two tabs racing with one
-- note cannot both get in. A row can go once its note has expired, because
-- an expired note is refused anyway.
CREATE TABLE IF NOT EXISTS "video_handoff_notes" (
  "note_id" varchar(64) PRIMARY KEY,
  "used_at" timestamptz NOT NULL,
  "expires_at" timestamptz NOT NULL
);

-- A guest's sign-in: one video project, 12 hours, and who they are in
-- Project, so the project's history can say "Sam via Project". Only the
-- SHA-256 of the cookie's token is kept. It is not an account and never
-- appears in the user list. Deleting the project ends its guests.
CREATE TABLE IF NOT EXISTS "video_project_guests" (
  "id" varchar(36) PRIMARY KEY,
  "token_hash" varchar(64) NOT NULL UNIQUE,
  "project_id" varchar(36) NOT NULL REFERENCES "video_projects" ("id") ON DELETE CASCADE,
  "person_id" varchar(36) NOT NULL,
  "person_name" text NOT NULL,
  "person_email" text NOT NULL,
  "created_at" timestamptz NOT NULL,
  "expires_at" timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS "ix_video_project_guests_project"
  ON "video_project_guests" ("project_id");

-- "Sam via Project" when a guest made the project's last save, and on each
-- version kept from a guest's save, so History says who changed it. Null is
-- the owner.
ALTER TABLE "video_projects" ADD COLUMN IF NOT EXISTS "last_edited_by" text;
ALTER TABLE "video_project_versions" ADD COLUMN IF NOT EXISTS "edited_by" text;
