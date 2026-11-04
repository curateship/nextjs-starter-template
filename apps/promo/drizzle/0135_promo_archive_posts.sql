-- Posting from the Archive (Video's task promo/01-send-to-promo-and-archive.md,
-- parts 13, 16 and 40). Additions only. Nothing stored is renamed or dropped.

-- A phone post of several pictures in order, an Instagram carousel or a
-- TikTok photo post (part 40). media_url keeps the first picture, so every
-- list that shows one file still shows one. [] on a photo or video post.
ALTER TABLE "promo_app_posts" ADD COLUMN IF NOT EXISTS "media_urls" jsonb NOT NULL DEFAULT '[]'::jsonb;

-- A LinkedIn document post: a carousel's PDF from the Archive and the title
-- LinkedIn asks for (part 16). '' on every other post.
ALTER TABLE "promo_linkedin_posts" ADD COLUMN IF NOT EXISTS "document_url" varchar(2048) NOT NULL DEFAULT '';
ALTER TABLE "promo_linkedin_posts" ADD COLUMN IF NOT EXISTS "document_title" varchar(200) NOT NULL DEFAULT '';

-- A video post's subtitles as an .srt file's words, copied from its archive
-- item when the draft is saved, so viewers can switch captions on (part 13).
ALTER TABLE "promo_linkedin_posts" ADD COLUMN IF NOT EXISTS "subtitles" text NOT NULL DEFAULT '';
