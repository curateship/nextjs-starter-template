-- When Pro ends (payments task 05, 12 Oct 2026). A weekly room whose host no
-- longer has Pro stops opening; Tyler's call: the rule stays saved and opens
-- on its days again once Pro is back.
--
-- `paused_at` is the moment a day was first skipped for that reason. It is
-- what makes the invitees' "is paused for now" notice go out once per pause
-- rather than every week, and it is cleared the next time a day books.
ALTER TABLE "pomodoro_room_repeats"
  ADD COLUMN IF NOT EXISTS "paused_at" timestamp with time zone;
