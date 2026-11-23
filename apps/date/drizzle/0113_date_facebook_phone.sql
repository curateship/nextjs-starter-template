-- Facebook Dating profiles (part 1 of "facebook/01-facebook-dating", Tyler,
-- 22 Oct 2026): the phone reports Facebook's version and whether Facebook is
-- in front, beside Tinder's. A profile's app is already a varchar(10), so
-- "facebook" needs no change there.
--
-- Additions only. Nothing stored is renamed or dropped.

ALTER TABLE "date_phones"
  ADD COLUMN IF NOT EXISTS "facebook_version" varchar(60) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "facebook_in_front" boolean NOT NULL DEFAULT false;
