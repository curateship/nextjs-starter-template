-- The admin activity log is gone from the app: nothing writes an entry any
-- more and there is no page reading them, so the rows would only pile up.
-- Dropping the table takes the stored history with it, on purpose.
--
-- Migrations replay in order on every setup, so 0004 recreates this table
-- just before this file removes it again — harmless, and it keeps every
-- database at the same end state.
DROP TABLE IF EXISTS "admin_audit_logs";
