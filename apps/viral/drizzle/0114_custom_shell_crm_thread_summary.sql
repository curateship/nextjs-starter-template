-- What this thread is about (CRM task 32, built in task 36, 7 Nov 2026): a
-- short summary somebody asked for with a press, kept with the number of
-- messages it was made at. A conversation with more messages than that has a
-- stale summary, worked out by comparing, never guessed.
ALTER TABLE "crm_threads" ADD COLUMN IF NOT EXISTS "summary" text;
ALTER TABLE "crm_threads" ADD COLUMN IF NOT EXISTS "summary_message_count" integer;
