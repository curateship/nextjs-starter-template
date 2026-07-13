update settings
set settings = settings || jsonb_build_object('orderConfirmation', true),
    updated_at = current_timestamp
where key = 'default'
  and not (settings ? 'orderConfirmation');
