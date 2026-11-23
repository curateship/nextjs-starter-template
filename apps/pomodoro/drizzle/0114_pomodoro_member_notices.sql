-- Group, badge, AI and streak notices (account-and-notifications task 04).

-- The group a group notice is about, so a second join while the first notice
-- is unread folds into it ("Sam and 1 other joined ...") instead of adding a
-- row. Kept, as null, when the group is deleted.
ALTER TABLE "pomodoro_notice_links"
  ADD COLUMN IF NOT EXISTS "group_id" uuid
    REFERENCES "pomodoro_groups" ("id") ON DELETE SET NULL;

-- How many events one unread notice stands for.
ALTER TABLE "pomodoro_notice_links"
  ADD COLUMN IF NOT EXISTS "fold_count" integer NOT NULL DEFAULT 1;

-- The fixed page of this app a notice leads to. Null when the link is a
-- person's public page, which is worked out when the tray is read.
ALTER TABLE "pomodoro_notice_links"
  ADD COLUMN IF NOT EXISTS "href" varchar(200);

-- When this month's "one left" and "none left" AI credit notices went out, so
-- each is sent once per month and kind, even after a refund.
ALTER TABLE "pomodoro_generation_usage"
  ADD COLUMN IF NOT EXISTS "warned_low_at" timestamp with time zone;
ALTER TABLE "pomodoro_generation_usage"
  ADD COLUMN IF NOT EXISTS "warned_empty_at" timestamp with time zone;
