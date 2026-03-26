BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'content_category_relationships'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'category_relationships'
  ) THEN
    ALTER TABLE content_category_relationships RENAME TO category_relationships;
  END IF;
END $$;

COMMIT;
