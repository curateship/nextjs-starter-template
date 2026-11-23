-- Automation node kinds are now defined and validated entirely by the app's node
-- registry (src/features/automations/domain). Dropping this database check means
-- adding a new node kind no longer requires a migration. Run-step status keeps
-- its own check constraint, since that lifecycle is owned by the executor.

ALTER TABLE site_automation_run_steps
  DROP CONSTRAINT IF EXISTS site_automation_run_steps_kind_check;
