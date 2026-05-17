DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'system_email_template_key_enum'
  ) THEN
    ALTER TYPE system_email_template_key_enum ADD VALUE IF NOT EXISTS 'product_email_modal_delivery';
  END IF;
END $$;
