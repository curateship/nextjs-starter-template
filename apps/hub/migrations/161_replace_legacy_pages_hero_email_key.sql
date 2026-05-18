DO $$
BEGIN
  IF to_regclass('public.email_system_templates') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM pg_type
      WHERE typname = 'system_email_template_key_enum'
    )
  THEN
    ALTER TABLE email_system_templates
      ALTER COLUMN template_key TYPE text
      USING template_key::text;

    DELETE FROM email_system_templates old_template
    USING email_system_templates new_template
    WHERE old_template.template_key = 'welcome_email'
      AND new_template.template_key = 'pages_hero_email'
      AND old_template.scope_key = new_template.scope_key;

    UPDATE email_system_templates
    SET template_key = 'pages_hero_email'
    WHERE template_key = 'welcome_email';

    DROP TYPE system_email_template_key_enum;

    CREATE TYPE system_email_template_key_enum AS ENUM (
      'password_reset',
      'email_verification',
      'email_change_confirmation',
      'lead_magnet_delivery',
      'product_email_modal_delivery',
      'paid_purchase_delivery',
      'pages_hero_email'
    );

    ALTER TABLE email_system_templates
      ALTER COLUMN template_key TYPE system_email_template_key_enum
      USING template_key::system_email_template_key_enum;
  END IF;
END $$;
