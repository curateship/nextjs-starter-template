-- A row of a site's home page can be centred on its own.
--
-- Every public page in CMS reads from the left, which is right for a list of
-- records and wrong for a hero somebody wants in the middle. This is per row
-- rather than per page so a centred hero can sit above a left-read row of
-- listings. Rows saved before this stay left, which is what they already drew.
ALTER TABLE "directory_front_page_sections"
  ADD COLUMN IF NOT EXISTS "centred" boolean NOT NULL DEFAULT false;
