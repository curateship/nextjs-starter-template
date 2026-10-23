-- The directory content type, and the first tables this app adds to the shell.
--
-- A listing is a page for one business or place: a title, a photo, contact
-- links and a written body. There is deliberately no block system, no template
-- table and no custom-block table — that whole layer of the directory app was
-- cut on purpose, and a listing here is a plain record edited with a normal
-- form. (This mirrors the shell's own "no page builder" decision on
-- written_pages.)
--
-- `cms` in the file name rather than `custom_shell`: this migration belongs to
-- the app, so a future shell migration can take 0044_custom_shell_* without
-- the two colliding.
--
-- `body` is the editor's own document tree, never HTML, cleaned by the same
-- `lib/pages/written-page-body.ts` the shell's written pages use — so no
-- string of markup is ever stored or handed to a browser. `contact_links` is
-- likewise a checked shape (`lib/directory/contact-links.ts`): every address
-- in it is run past the same "no javascript:" rules before it is stored.
CREATE TABLE IF NOT EXISTS "directory_listings" (
  "id" varchar(36) PRIMARY KEY,
  "title" varchar(200) NOT NULL,
  -- The address part after /directory/, unique so two listings cannot claim
  -- one page. Lowercase letters, numbers and dashes only, enforced on the
  -- server where the wording of the refusal lives.
  "slug" varchar(160) NOT NULL,
  -- What a search result shows under the title. Plain text, may be empty.
  "meta_description" varchar(300) NOT NULL DEFAULT '',
  -- 'draft' or 'published'. Drafts never reach a visitor.
  "status" varchar(20) NOT NULL DEFAULT 'draft',
  -- Hand-set ordering for the public list's "display order" sort. Ties fall
  -- back to newest-first.
  "display_order" integer NOT NULL DEFAULT 0,
  -- A media-library URL, or empty. The bytes live in the media tables.
  "featured_image" varchar(600) NOT NULL DEFAULT '',
  -- { address, menuLinks: [{id,type,label,value}], socialLinks: [{id,platform,url}] }
  "contact_links" jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- The written body, as the editor's document tree.
  "body" jsonb NOT NULL DEFAULT '{"type":"doc","content":[]}'::jsonb,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  CONSTRAINT "directory_listings_status_check"
    CHECK ("status" IN ('draft', 'published'))
);

-- One listing per address, held even if two saves land at the same moment.
CREATE UNIQUE INDEX IF NOT EXISTS "directory_listings_slug_key"
  ON "directory_listings" ("slug");

-- The admin list filters by status and sorts by these; the public list reads
-- published rows ordered by display_order and created_at.
CREATE INDEX IF NOT EXISTS "ix_directory_listings_status"
  ON "directory_listings" ("status");
CREATE INDEX IF NOT EXISTS "ix_directory_listings_created_at"
  ON "directory_listings" ("created_at");
CREATE INDEX IF NOT EXISTS "ix_directory_listings_updated_at"
  ON "directory_listings" ("updated_at");
CREATE INDEX IF NOT EXISTS "ix_directory_listings_title"
  ON "directory_listings" ("title");

-- Categories organise listings for browsing and filtering. A category may sit
-- under another (one tree, no depth limit in the schema — the server keeps the
-- tree sensible), and deleting a parent re-hangs its children on the deleted
-- one's parent rather than orphaning them.
CREATE TABLE IF NOT EXISTS "categories" (
  "id" varchar(36) PRIMARY KEY,
  "name" varchar(120) NOT NULL,
  -- Unique across the whole tree, so a category page has one address.
  "slug" varchar(160) NOT NULL,
  "description" varchar(500) NOT NULL DEFAULT '',
  -- Null for a top-level category. No FK ON DELETE action on purpose: the
  -- server re-parents children in the same transaction as the delete.
  "parent_id" varchar(36),
  "display_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "categories_slug_key"
  ON "categories" ("slug");
CREATE INDEX IF NOT EXISTS "ix_categories_parent_id"
  ON "categories" ("parent_id");

-- Which categories a piece of content is in. Polymorphic on purpose:
-- `content_type` is 'directory_listing' today, and the next content type this
-- app grows shares this table instead of getting a twin of it. `is_primary`
-- marks the one category a listing's breadcrumb names; the server keeps it to
-- at most one per piece of content.
CREATE TABLE IF NOT EXISTS "category_relationships" (
  "id" varchar(36) PRIMARY KEY,
  "category_id" varchar(36) NOT NULL
    REFERENCES "categories" ("id") ON DELETE CASCADE,
  "content_type" varchar(40) NOT NULL,
  "content_id" varchar(36) NOT NULL,
  "is_primary" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL
);

-- A piece of content is in a category once, not twice.
CREATE UNIQUE INDEX IF NOT EXISTS "category_relationships_unique_key"
  ON "category_relationships" ("category_id", "content_type", "content_id");
-- "Which categories is this listing in" is the query every page asks.
CREATE INDEX IF NOT EXISTS "ix_category_relationships_content"
  ON "category_relationships" ("content_type", "content_id");
