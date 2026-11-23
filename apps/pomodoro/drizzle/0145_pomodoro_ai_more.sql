-- More from the AI generators (uploads-and-sharing task 06, 10 Oct 2026).
--
-- A request can carry a style pill (part 6), start from one of the member's
-- own pictures (part 3), and be one half of a whole look made from one prompt
-- (part 7). `from_picture` stays true when the picture is deleted before the
-- worker reaches it, so the worker knows to refuse rather than make a film
-- from words alone.
ALTER TABLE "pomodoro_generations"
  ADD COLUMN IF NOT EXISTS "style" varchar(20),
  ADD COLUMN IF NOT EXISTS "from_picture" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "picture_media_id" varchar(36)
    REFERENCES "media"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "look_id" uuid;

CREATE INDEX IF NOT EXISTS "pomodoro_generations_look_idx"
  ON "pomodoro_generations" ("look_id")
  WHERE "look_id" IS NOT NULL;

-- Who made a file a member imported from Pixabay (part 8) and its Pixabay
-- page, kept so the credit follows the file: "Ruben on Pixabay". Null for
-- everything else.
ALTER TABLE "pomodoro_media_uploads"
  ADD COLUMN IF NOT EXISTS "source_author" varchar(160),
  ADD COLUMN IF NOT EXISTS "source_page_url" varchar(500);

-- A member's pasted Pixabay link, waiting for the Pixabay worker (part 8).
-- The finished file is an ordinary upload; this row is the queue and the
-- daily count.
CREATE TABLE IF NOT EXISTS "pomodoro_member_imports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "url" varchar(500) NOT NULL,
  "family" varchar(10) NOT NULL,
  "pixabay_id" varchar(20) NOT NULL,
  "name" varchar(80) NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'queued',
  "failure_reason" varchar(200),
  "media_id" varchar(36) REFERENCES "media"("id") ON DELETE SET NULL,
  "attempts" integer NOT NULL DEFAULT 0,
  "claimed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "pomodoro_member_imports_family_check"
    CHECK ("family" IN ('image', 'video')),
  CONSTRAINT "pomodoro_member_imports_status_check"
    CHECK ("status" IN ('queued', 'running', 'ready', 'failed'))
);

CREATE INDEX IF NOT EXISTS "pomodoro_member_imports_user_idx"
  ON "pomodoro_member_imports" ("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "pomodoro_member_imports_queue_idx"
  ON "pomodoro_member_imports" ("status", "created_at");
