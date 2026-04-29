DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'categories'
      AND column_name = 'description'
  ) THEN
    UPDATE categories
    SET meta_description = NULLIF(TRIM(REGEXP_REPLACE(description, '<[^>]*>', '', 'g')), '')
    WHERE meta_description IS NULL
      AND description IS NOT NULL;

    ALTER TABLE categories DROP COLUMN description;
  END IF;
END $$;
