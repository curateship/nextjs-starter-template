-- Whether a post's own page draws its cover image.
--
-- The picture is still the post's cover everywhere else: the Posts page, a
-- category page and a home page row all draw their cards from it. This switch
-- is only about the top of `/posts/<address>`, where a site that leads with a
-- big headline may not want the same photo repeated.
--
-- True, because that is what every post page did before this column existed,
-- so no site loses a picture by this shipping.
ALTER TABLE "directory_settings"
  ADD COLUMN IF NOT EXISTS "post_cover_image" boolean NOT NULL DEFAULT true;
