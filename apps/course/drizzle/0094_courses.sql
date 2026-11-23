-- Courses: written guides, each a list of chapters, with what each member
-- did in them. The Drizzle side is `src/server/courses/schema.ts`.
--
-- A chapter's `body` is the editor's own document tree, never HTML. The shapes
-- it may hold live in `src/lib/courses/chapter-body.ts`.

CREATE TABLE IF NOT EXISTS "courses" (
  "id" varchar(36) PRIMARY KEY,
  -- Deleting a site deletes its courses.
  "workspace_id" varchar(36) NOT NULL
    REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "title" varchar(200) NOT NULL,
  -- The address part after /courses/, unique within one site.
  "slug" varchar(160) NOT NULL,
  "description" varchar(600) NOT NULL DEFAULT '',
  -- A media-library address, or empty.
  "image" varchar(600) NOT NULL DEFAULT '',
  -- Who may read it: anyone, anyone signed in, or a paying member.
  "access" varchar(20) NOT NULL DEFAULT 'everyone',
  -- For a paid course, the plans that unlock it. Empty means any paid plan.
  "plan_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "status" varchar(20) NOT NULL DEFAULT 'draft',
  "position" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  CONSTRAINT "courses_access_check"
    CHECK ("access" IN ('everyone', 'members', 'paid')),
  CONSTRAINT "courses_status_check"
    CHECK ("status" IN ('draft', 'published'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "ux_courses_workspace_slug"
  ON "courses" ("workspace_id", "slug");
CREATE INDEX IF NOT EXISTS "ix_courses_workspace_position"
  ON "courses" ("workspace_id", "position");

-- A part heading chapters sit under.
CREATE TABLE IF NOT EXISTS "course_groups" (
  "id" varchar(36) PRIMARY KEY,
  "course_id" varchar(36) NOT NULL
    REFERENCES "courses"("id") ON DELETE CASCADE,
  "title" varchar(200) NOT NULL,
  "position" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS "ix_course_groups_course"
  ON "course_groups" ("course_id");

CREATE TABLE IF NOT EXISTS "course_chapters" (
  "id" varchar(36) PRIMARY KEY,
  "course_id" varchar(36) NOT NULL
    REFERENCES "courses"("id") ON DELETE CASCADE,
  -- Deleting a part keeps its chapters; they move above every part.
  "group_id" varchar(36)
    REFERENCES "course_groups"("id") ON DELETE SET NULL,
  "title" varchar(200) NOT NULL,
  "slug" varchar(160) NOT NULL,
  "body" jsonb NOT NULL DEFAULT '{"type":"doc","content":[]}'::jsonb,
  "read_minutes" integer NOT NULL DEFAULT 1,
  "position" integer NOT NULL DEFAULT 0,
  "status" varchar(20) NOT NULL DEFAULT 'draft',
  -- Open to anyone, whatever the course's own access says.
  "is_preview" boolean NOT NULL DEFAULT false,
  -- Days after a member first opens the course before this chapter opens.
  "opens_after_days" integer,
  -- A published chapter stays hidden until this moment, when set.
  "publish_at" timestamptz,
  "audio_url" varchar(600) NOT NULL DEFAULT '',
  "audio_text_hash" varchar(64) NOT NULL DEFAULT '',
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  CONSTRAINT "course_chapters_status_check"
    CHECK ("status" IN ('draft', 'published')),
  CONSTRAINT "course_chapters_opens_after_check"
    CHECK ("opens_after_days" IS NULL OR "opens_after_days" BETWEEN 1 AND 365)
);

CREATE UNIQUE INDEX IF NOT EXISTS "ux_course_chapters_course_slug"
  ON "course_chapters" ("course_id", "slug");
CREATE INDEX IF NOT EXISTS "ix_course_chapters_course"
  ON "course_chapters" ("course_id", "position");

-- When a member first opened a course, and the chapter they last opened.
CREATE TABLE IF NOT EXISTS "course_starts" (
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "course_id" varchar(36) NOT NULL REFERENCES "courses"("id") ON DELETE CASCADE,
  "started_at" timestamptz NOT NULL,
  "last_chapter_id" varchar(36)
    REFERENCES "course_chapters"("id") ON DELETE SET NULL,
  "last_opened_at" timestamptz NOT NULL,
  PRIMARY KEY ("user_id", "course_id")
);

CREATE INDEX IF NOT EXISTS "ix_course_starts_course"
  ON "course_starts" ("course_id");

CREATE TABLE IF NOT EXISTS "course_chapter_views" (
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "chapter_id" varchar(36) NOT NULL
    REFERENCES "course_chapters"("id") ON DELETE CASCADE,
  "first_viewed_at" timestamptz NOT NULL,
  PRIMARY KEY ("user_id", "chapter_id")
);

CREATE INDEX IF NOT EXISTS "ix_course_chapter_views_chapter"
  ON "course_chapter_views" ("chapter_id");

CREATE TABLE IF NOT EXISTS "course_chapter_progress" (
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "chapter_id" varchar(36) NOT NULL
    REFERENCES "course_chapters"("id") ON DELETE CASCADE,
  "finished_at" timestamptz NOT NULL,
  PRIMARY KEY ("user_id", "chapter_id")
);

CREATE INDEX IF NOT EXISTS "ix_course_chapter_progress_chapter"
  ON "course_chapter_progress" ("chapter_id");

CREATE TABLE IF NOT EXISTS "course_bookmarks" (
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "chapter_id" varchar(36) NOT NULL
    REFERENCES "course_chapters"("id") ON DELETE CASCADE,
  "created_at" timestamptz NOT NULL,
  PRIMARY KEY ("user_id", "chapter_id")
);

-- A member's private notes. Deleting the account deletes them.
CREATE TABLE IF NOT EXISTS "course_notes" (
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "chapter_id" varchar(36) NOT NULL
    REFERENCES "course_chapters"("id") ON DELETE CASCADE,
  "body" text NOT NULL,
  "updated_at" timestamptz NOT NULL,
  PRIMARY KEY ("user_id", "chapter_id")
);

-- Ticked checklist items and picked quiz choices, keyed by the item's own id.
CREATE TABLE IF NOT EXISTS "course_block_answers" (
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "chapter_id" varchar(36) NOT NULL
    REFERENCES "course_chapters"("id") ON DELETE CASCADE,
  "kind" varchar(20) NOT NULL,
  "item_id" varchar(32) NOT NULL,
  "choice_id" varchar(32) NOT NULL DEFAULT '',
  "updated_at" timestamptz NOT NULL,
  PRIMARY KEY ("user_id", "chapter_id", "kind", "item_id"),
  CONSTRAINT "course_block_answers_kind_check"
    CHECK ("kind" IN ('checklist', 'quiz'))
);

-- Questions under a chapter, each with one answer from an admin.
CREATE TABLE IF NOT EXISTS "course_questions" (
  "id" varchar(36) PRIMARY KEY,
  "chapter_id" varchar(36) NOT NULL
    REFERENCES "course_chapters"("id") ON DELETE CASCADE,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "body" text NOT NULL,
  "answer" text NOT NULL DEFAULT '',
  "answered_at" timestamptz,
  "created_at" timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS "ix_course_questions_chapter"
  ON "course_questions" ("chapter_id", "created_at");
