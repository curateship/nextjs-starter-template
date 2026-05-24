DO $$
DECLARE
  rename_pair record;
  index_row record;
  constraint_row record;
BEGIN
  FOR rename_pair IN
    SELECT *
    FROM (VALUES
      ('ai_video_users', 'users'),
      ('ai_video_sessions', 'sessions'),
      ('ai_video_settings', 'settings'),
      ('ai_video_feedback', 'feedback'),
      ('ai_video_feedback_votes', 'feedback_votes'),
      ('ai_video_feedback_comments', 'feedback_comments'),
      ('ai_video_notifications', 'notifications'),
      ('ai_video_workspaces', 'workspaces'),
      ('ai_video_media', 'media'),
      ('ai_video_generations', 'generations'),
      ('ai_video_login_attempts', 'login_attempts')
    ) AS pairs(old_name, new_name)
  LOOP
    IF to_regclass(rename_pair.old_name) IS NOT NULL
       AND to_regclass(rename_pair.new_name) IS NULL THEN
      EXECUTE format(
        'ALTER TABLE %I RENAME TO %I',
        rename_pair.old_name,
        rename_pair.new_name
      );
    ELSIF to_regclass(rename_pair.old_name) IS NOT NULL
       AND to_regclass(rename_pair.new_name) IS NOT NULL THEN
      RAISE EXCEPTION 'Cannot rename %, % already exists',
        rename_pair.old_name,
        rename_pair.new_name;
    END IF;
  END LOOP;

  FOR constraint_row IN
    SELECT conrelid::regclass AS table_name, conname
    FROM pg_constraint
    WHERE conname LIKE '%ai_video_%'
  LOOP
    EXECUTE format(
      'ALTER TABLE %s RENAME CONSTRAINT %I TO %I',
      constraint_row.table_name,
      constraint_row.conname,
      replace(constraint_row.conname, 'ai_video_', '')
    );
  END LOOP;

  FOR index_row IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('i', 'I')
      AND c.relname LIKE '%ai_video_%'
  LOOP
    EXECUTE format(
      'ALTER INDEX %I RENAME TO %I',
      index_row.relname,
      replace(index_row.relname, 'ai_video_', '')
    );
  END LOOP;
END $$;
