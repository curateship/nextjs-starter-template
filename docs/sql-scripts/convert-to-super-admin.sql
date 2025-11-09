-- Script to convert an existing user to super_admin role
-- Replace 'your-email@example.com' with your actual email address

-- Option 1: Update by email
UPDATE auth.users
SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || '{"role": "super_admin"}'::jsonb
WHERE email = 'typham2@gmail.com';

-- Option 2: Update by user ID (if you know your user ID)
-- UPDATE auth.users
-- SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || '{"role": "super_admin"}'::jsonb
-- WHERE id = 'your-user-id-here';

-- Verify the update
SELECT
  id,
  email,
  raw_app_meta_data->>'role' as role,
  created_at,
  email_confirmed_at
FROM auth.users
WHERE email = 'typham2@gmail.com';
