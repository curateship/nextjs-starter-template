-- Same person on two apps (part 15 of "facebook/01-facebook-dating"): a
-- fingerprint of the first photo's look, kept for every card read from now
-- on, and the member's other profile where this person was already met and
-- what happened there ('passed', 'liked', 'matched' or 'chatted').
--
-- Additions only. Nothing stored is renamed or dropped.

ALTER TABLE "date_profiles"
  ADD COLUMN IF NOT EXISTS "face_hash" varchar(16) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "seen_on_account_id" varchar(36) REFERENCES "date_accounts"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "seen_on_outcome" varchar(10);
