# Legacy SQL Notes

- This folder contains historical and manual SQL migrations.
- Many files here were written against older Supabase-style auth and RLS patterns.
- The current app runtime uses Better Auth.
- Do not treat `auth.uid()`, `auth.role()`, `auth.users`, storage policies, or `supabase_url` references here as proof of current infrastructure.
- Before reusing SQL from this folder, validate the current auth model and app flow first.
