DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'system_email_template_key_enum'
  ) THEN
    ALTER TYPE system_email_template_key_enum ADD VALUE IF NOT EXISTS 'magic_link';
  END IF;
END $$;
