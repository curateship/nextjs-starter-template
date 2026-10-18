-- Pages an admin writes, rather than pages the code declares.
--
-- Everything else in the Pages batch is settings: a page exists because a
-- `*.page.ts` file sits beside a route, and what an admin changed about it
-- rides in the app-wide settings row. This table is the one exception, because
-- it holds *content* — the words themselves — and content is not settings.
--
-- Nothing existing changes. The table starts empty, no other table gains a
-- column, and an install that never writes a page behaves exactly as it did.
--
-- `body` is the editor's own document, not HTML. The public page draws it by
-- turning named nodes into elements, so no string of markup is ever stored,
-- sanitised, or handed to a browser — see `lib/pages/written-page-body.ts`.
-- Storing HTML here instead would put an injection surface in the one table
-- whose whole purpose is to be shown to the open internet.
--
-- There is no on/off column on purpose. Page visibility already switches any
-- page — written or code — on, off or members-only by address, and a second
-- switch here would be two answers to the same question.
CREATE TABLE IF NOT EXISTS "written_pages" (
  "id" varchar(36) PRIMARY KEY,
  -- The address it answers on, always starting with "/". Unique, so two
  -- written pages cannot claim the same one; a clash with a *code* page is
  -- refused in the server, which is the only place that knows both lists.
  "path" varchar(160) NOT NULL,
  "title" varchar(200) NOT NULL,
  "body" jsonb NOT NULL DEFAULT '{"type":"doc","content":[]}'::jsonb,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL
);

-- One page per address. This is the guard that holds even if two admins press
-- Create at the same moment, which the read-then-write check above it cannot.
CREATE UNIQUE INDEX IF NOT EXISTS "written_pages_path_key"
  ON "written_pages" ("path");
