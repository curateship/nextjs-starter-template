-- Instagram on the card (part 12 of "facebook/01-facebook-dating"): the
-- Instagram pictures a Facebook Dating card shows, kept like its photos and
-- given to the AI as extra photos.
--
-- Additions only. Nothing stored is renamed or dropped.

ALTER TABLE "date_profiles"
  ADD COLUMN IF NOT EXISTS "instagram_photo_ids" jsonb NOT NULL DEFAULT '[]'::jsonb;
