-- Report notices (account-and-notifications task 05): when a reporter was told
-- their report was reviewed. Set the first time the report is resolved or
-- dismissed, and never cleared, so reopening a report and closing it again
-- does not tell the reporter a second time. Null on every report closed
-- before this existed, which therefore never sends a late notice.
ALTER TABLE "room_reports" ADD COLUMN IF NOT EXISTS "reporter_told_at" timestamp with time zone;
