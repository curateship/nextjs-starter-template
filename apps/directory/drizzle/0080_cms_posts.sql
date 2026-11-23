-- Posts: dated articles an admin writes for one site.
--
-- A post is a dated article: a title, an address under /posts/, a cover image,
-- a one-line summary and a written body. It is its own table rather than a
-- wider written page, because the shell's written pages are only a title, an
-- address and a body, and must stay that way.
--
-- `body` is the editor's own document tree, never HTML. It holds the same
-- nodes a written page may hold plus one more, a listing card that stores only
-- the listing's id. The allowed shapes live in `lib/posts/post-body.ts`.
--
-- Categories are not a column here. A post is filed through the shared
-- `category_relationships` table with `content_type = 'post'`, the same
-- way a listing is filed with 'directory_listing'.
CREATE TABLE IF NOT EXISTS "posts" (
  "id" varchar(36) PRIMARY KEY,
  -- Deleting a site deletes its posts.
  "workspace_id" varchar(36) NOT NULL
    REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "title" varchar(200) NOT NULL,
  -- The address part after /posts/, unique within one site.
  "slug" varchar(160) NOT NULL,
  -- A media-library URL, or empty.
  "cover_image" varchar(600) NOT NULL DEFAULT '',
  -- One or two sentences for the posts list, search results and share cards.
  "summary" varchar(300) NOT NULL DEFAULT '',
  "body" jsonb NOT NULL DEFAULT '{"type":"doc","content":[]}'::jsonb,
  -- 'draft' or 'published'. A draft is never readable by a visitor.
  "status" varchar(20) NOT NULL DEFAULT 'draft',
  -- Set the first time the post is published and kept after that, so taking a
  -- post down and putting it back does not move it to the top of the list.
  "published_at" timestamptz,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  CONSTRAINT "posts_status_check"
    CHECK ("status" IN ('draft', 'published')),
  -- A published post always has a date to sort and show it by.
  CONSTRAINT "posts_published_has_date_check"
    CHECK ("status" <> 'published' OR "published_at" IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS "ux_posts_workspace_slug"
  ON "posts" ("workspace_id", "slug");

-- The public Posts page reads one site's published posts, newest first.
CREATE INDEX IF NOT EXISTS "ix_posts_workspace_status_published"
  ON "posts" ("workspace_id", "status", "published_at");
