-- Adds the 'listing' node kind to the automation run-step check constraint so
-- automations can end in a Listing node that drafts directory listings (in
-- addition to the existing Post node). No new columns are needed: automation-
-- created listings reuse the directory table's sourceType/sourceId columns.

ALTER TABLE site_automation_run_steps
  DROP CONSTRAINT IF EXISTS site_automation_run_steps_kind_check;

ALTER TABLE site_automation_run_steps
  ADD CONSTRAINT site_automation_run_steps_kind_check
  CHECK (node_kind in ('time', 'scraper', 'router', 'agent', 'post', 'listing'));
