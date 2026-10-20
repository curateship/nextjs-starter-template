-- Guests sent from Project (Connected apps task 01, Tyler, 19 Oct 2026).
-- Somebody on a Project task presses "Open in Promo", Project stamps a note
-- that works once within 60 seconds, and Promo signs them in to that one
-- Promo project for 12 hours. They have no Promo account.
--
-- Every note's one-time id is kept here once used, so a copied address
-- fails. The row is written in the same transaction as the guest sign-in,
-- and the primary key refuses a second copy, so two tabs racing with one
-- note cannot both get in. A row can go once its note has expired, because
-- an expired note is refused anyway.
CREATE TABLE IF NOT EXISTS "promo_handoff_notes" (
  "note_id" varchar(64) PRIMARY KEY,
  "used_at" timestamptz NOT NULL,
  "expires_at" timestamptz NOT NULL
);

-- A guest's sign-in: one Promo project, 12 hours, and who they are in
-- Project, so a comment they send can say "Sam via Project". Only the
-- SHA-256 of the cookie's token is kept. It is not an account and never
-- appears in the user list. Deleting the project ends its guests.
CREATE TABLE IF NOT EXISTS "promo_project_guests" (
  "id" varchar(36) PRIMARY KEY,
  "token_hash" varchar(64) NOT NULL UNIQUE,
  "project_id" varchar(36) NOT NULL REFERENCES "promo_projects" ("id") ON DELETE CASCADE,
  "person_id" varchar(36) NOT NULL,
  "person_name" text NOT NULL,
  "person_email" text NOT NULL,
  "created_at" timestamptz NOT NULL,
  "expires_at" timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS "ix_promo_project_guests_project"
  ON "promo_project_guests" ("project_id");

-- Who pressed Post, when it was a guest: "Sam via Project". Null when the
-- owner sent it, which is every row made before this.
ALTER TABLE "promo_comments" ADD COLUMN IF NOT EXISTS "sent_by" text;
ALTER TABLE "promo_posts" ADD COLUMN IF NOT EXISTS "sent_by" text;
