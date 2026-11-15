-- The Library dashboard on the shell's three-panel design (Tyler, 15 Nov
-- 2026: "We need to revamp the ui to the new shell 3 panel ui", then "I think
-- the library should live as a left panel dashboard block").
--
-- Each person's left page on it: what is written there, its cover and its
-- lock, the same shape as the CRM's page and Travel's Trips page. The fixed
-- Libraries block lists every library on it. A person with no row sees the
-- page's starting blocks.
CREATE TABLE IF NOT EXISTS "note_library_pages" (
  "user_id" varchar(36) PRIMARY KEY NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "body" text NOT NULL DEFAULT '',
  "cover_url" text,
  "cover_images" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "locked" boolean NOT NULL DEFAULT false,
  "updated_at" timestamp with time zone NOT NULL
);
