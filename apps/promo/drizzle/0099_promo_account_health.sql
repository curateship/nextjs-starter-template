-- Whether the Reddit account is in good standing: its karma, how old it is,
-- and whether its profile loads for somebody who is not signed in.
--
-- karma was already a column, and nothing had written to it. These sit beside
-- it. Every one is null until a reading is taken, so "never read" and "read,
-- and it was zero" stay different answers.
--
-- Additions only.
ALTER TABLE "promo_accounts"
  ADD COLUMN IF NOT EXISTS "reddit_created_at" timestamptz,
  -- When karma and the account's age were last read. One reading carries both.
  ADD COLUMN IF NOT EXISTS "karma_read_at" timestamptz,
  -- The profile asked for signed in and signed out: what each answered, for
  -- which handle, and when. The app words it; it stores only what was seen.
  ADD COLUMN IF NOT EXISTS "profile_check" jsonb;
