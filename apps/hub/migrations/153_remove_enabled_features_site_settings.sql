UPDATE sites
SET
  settings = settings - 'enabled_features' - 'feature_order',
  updated_at = NOW()
WHERE settings ? 'enabled_features'
   OR settings ? 'feature_order';
