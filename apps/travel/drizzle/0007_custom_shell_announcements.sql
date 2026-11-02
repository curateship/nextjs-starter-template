CREATE TABLE IF NOT EXISTS "announcements" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "title" varchar(200) NOT NULL,
  "body" text NOT NULL,
  "level" varchar(20) NOT NULL DEFAULT 'info',
  "show_banner" boolean NOT NULL DEFAULT true,
  "notify" boolean NOT NULL DEFAULT false,
  -- The window it shows in. `starts_at` is always set (an announcement posted
  -- now starts now); a null `ends_at` means it runs until somebody retires it,
  -- and retiring is exactly "set `ends_at` to this moment".
  "starts_at" timestamp with time zone NOT NULL,
  "ends_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "announcements_level_check"
    CHECK ("level" in ('info', 'warning', 'critical')),
  -- `>=` rather than `>` on purpose: retiring something that had not started
  -- yet closes its window down to nothing, which is how it never shows.
  CONSTRAINT "announcements_window_check"
    CHECK ("ends_at" is null or "ends_at" >= "starts_at"),
  -- An announcement nobody can see is not an announcement.
  CONSTRAINT "announcements_channel_check"
    CHECK ("show_banner" or "notify")
);

CREATE INDEX IF NOT EXISTS "ix_announcements_window" ON "announcements" ("starts_at", "ends_at");

-- Dismissing hides the banner for one person only, so the row is the pair.
CREATE TABLE IF NOT EXISTS "announcement_dismissals" (
  "announcement_id" varchar(36) NOT NULL
    REFERENCES "announcements"("id") ON DELETE CASCADE,
  "user_id" varchar(36) NOT NULL
    REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone NOT NULL,
  PRIMARY KEY ("announcement_id", "user_id")
);

CREATE INDEX IF NOT EXISTS "ix_announcement_dismissals_user_id" ON "announcement_dismissals" ("user_id");

-- The other half of an announcement rides the notification tray, the same way a
-- published changelog entry does.
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "announcement_id" varchar(36)
  REFERENCES "announcements"("id") ON DELETE CASCADE;

-- One notice per person per announcement. The fan-out happens the first time
-- somebody loads the app while the announcement is live, so this is what stops a
-- second tab from writing them a duplicate.
CREATE UNIQUE INDEX IF NOT EXISTS "ux_notifications_announcement_recipient"
  ON "notifications" ("announcement_id", "recipient_user_id")
  WHERE "announcement_id" IS NOT NULL;

ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "notifications_type_check";
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_type_check"
  CHECK ("type" in ('feedback_vote', 'feedback_comment', 'changelog', 'announcement'));
