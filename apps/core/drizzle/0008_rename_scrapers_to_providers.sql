DO $$
BEGIN
  IF to_regclass('public.provider_settings') IS NULL AND to_regclass('public.scraper_provider_settings') IS NOT NULL THEN
    ALTER TABLE "scraper_provider_settings" RENAME TO "provider_settings";
  END IF;

  IF to_regclass('public.provider_run_configs') IS NULL AND to_regclass('public.scraper_runs') IS NOT NULL THEN
    ALTER TABLE "scraper_runs" RENAME TO "provider_run_configs";
  END IF;

  IF to_regclass('public.provider_executions') IS NULL AND to_regclass('public.scraper_executions') IS NOT NULL THEN
    ALTER TABLE "scraper_executions" RENAME TO "provider_executions";
  END IF;

  IF to_regclass('public.provider_results') IS NULL AND to_regclass('public.scraper_results') IS NOT NULL THEN
    ALTER TABLE "scraper_results" RENAME TO "provider_results";
  END IF;
END $$;

DO $$
DECLARE
  constraint_row record;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'provider_run_configs' AND column_name = 'scraper_key') THEN
    ALTER TABLE "provider_run_configs" RENAME COLUMN "scraper_key" TO "provider_key";
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'provider_executions' AND column_name = 'run_id') THEN
    ALTER TABLE "provider_executions" RENAME COLUMN "run_id" TO "run_config_id";
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'provider_results' AND column_name = 'run_id') THEN
    ALTER TABLE "provider_results" RENAME COLUMN "run_id" TO "run_config_id";
  END IF;

  FOR constraint_row IN
    SELECT * FROM (VALUES
      ('provider_settings', 'scraper_provider_settings_pkey', 'provider_settings_pkey'),
      ('provider_settings', 'scraper_provider_settings_provider_check', 'provider_settings_provider_check'),
      ('provider_settings', 'scraper_provider_settings_config_not_null', 'provider_settings_config_not_null'),
      ('provider_settings', 'scraper_provider_settings_created_at_not_null', 'provider_settings_created_at_not_null'),
      ('provider_settings', 'scraper_provider_settings_provider_key_not_null', 'provider_settings_provider_key_not_null'),
      ('provider_settings', 'scraper_provider_settings_updated_at_not_null', 'provider_settings_updated_at_not_null'),
      ('provider_settings', 'scraper_provider_settings_workspace_id_fkey', 'provider_settings_workspace_id_fkey'),
      ('provider_settings', 'scraper_provider_settings_workspace_id_not_null', 'provider_settings_workspace_id_not_null'),
      ('provider_run_configs', 'scraper_runs_pkey', 'provider_run_configs_pkey'),
      ('provider_run_configs', 'scraper_runs_key_check', 'provider_run_configs_key_check'),
      ('provider_run_configs', 'scraper_runs_status_check', 'provider_run_configs_status_check'),
      ('provider_run_configs', 'scraper_runs_created_at_not_null', 'provider_run_configs_created_at_not_null'),
      ('provider_run_configs', 'scraper_runs_id_not_null', 'provider_run_configs_id_not_null'),
      ('provider_run_configs', 'scraper_runs_input_not_null', 'provider_run_configs_input_not_null'),
      ('provider_run_configs', 'scraper_runs_metadata_not_null', 'provider_run_configs_metadata_not_null'),
      ('provider_run_configs', 'scraper_runs_name_not_null', 'provider_run_configs_name_not_null'),
      ('provider_run_configs', 'scraper_runs_scraper_key_not_null', 'provider_run_configs_provider_key_not_null'),
      ('provider_run_configs', 'scraper_runs_status_not_null', 'provider_run_configs_status_not_null'),
      ('provider_run_configs', 'scraper_runs_updated_at_not_null', 'provider_run_configs_updated_at_not_null'),
      ('provider_run_configs', 'scraper_runs_workspace_id_fkey', 'provider_run_configs_workspace_id_fkey'),
      ('provider_run_configs', 'scraper_runs_workspace_id_not_null', 'provider_run_configs_workspace_id_not_null'),
      ('provider_executions', 'scraper_executions_pkey', 'provider_executions_pkey'),
      ('provider_executions', 'scraper_executions_provider_check', 'provider_executions_provider_check'),
      ('provider_executions', 'scraper_executions_status_check', 'provider_executions_status_check'),
      ('provider_executions', 'scraper_executions_created_at_not_null', 'provider_executions_created_at_not_null'),
      ('provider_executions', 'scraper_executions_id_not_null', 'provider_executions_id_not_null'),
      ('provider_executions', 'scraper_executions_provider_key_not_null', 'provider_executions_provider_key_not_null'),
      ('provider_executions', 'scraper_executions_run_id_fkey', 'provider_executions_run_config_id_fkey'),
      ('provider_executions', 'scraper_executions_run_id_not_null', 'provider_executions_run_config_id_not_null'),
      ('provider_executions', 'scraper_executions_stats_not_null', 'provider_executions_stats_not_null'),
      ('provider_executions', 'scraper_executions_status_not_null', 'provider_executions_status_not_null'),
      ('provider_executions', 'scraper_executions_updated_at_not_null', 'provider_executions_updated_at_not_null'),
      ('provider_results', 'scraper_results_pkey', 'provider_results_pkey'),
      ('provider_results', 'scraper_results_created_at_not_null', 'provider_results_created_at_not_null'),
      ('provider_results', 'scraper_results_data_not_null', 'provider_results_data_not_null'),
      ('provider_results', 'scraper_results_execution_id_fkey', 'provider_results_execution_id_fkey'),
      ('provider_results', 'scraper_results_execution_id_not_null', 'provider_results_execution_id_not_null'),
      ('provider_results', 'scraper_results_id_not_null', 'provider_results_id_not_null'),
      ('provider_results', 'scraper_results_run_id_fkey', 'provider_results_run_config_id_fkey'),
      ('provider_results', 'scraper_results_run_id_not_null', 'provider_results_run_config_id_not_null'),
      ('provider_results', 'scraper_results_title_not_null', 'provider_results_title_not_null')
    ) AS names(table_name, old_name, new_name)
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = to_regclass('public.' || constraint_row.table_name)
        AND conname = constraint_row.old_name
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I RENAME CONSTRAINT %I TO %I',
        constraint_row.table_name,
        constraint_row.old_name,
        constraint_row.new_name
      );
    END IF;
  END LOOP;
END $$;

ALTER INDEX IF EXISTS "ix_scraper_runs_workspace_scraper_status" RENAME TO "ix_provider_run_configs_workspace_provider_status";
ALTER INDEX IF EXISTS "ix_scraper_runs_scraper_status" RENAME TO "ix_provider_run_configs_provider_status";
ALTER INDEX IF EXISTS "ix_scraper_executions_run_created" RENAME TO "ix_provider_executions_run_config_created";
ALTER INDEX IF EXISTS "ix_scraper_results_execution_id" RENAME TO "ix_provider_results_execution_id";
ALTER INDEX IF EXISTS "ix_scraper_results_run_id" RENAME TO "ix_provider_results_run_config_id";
