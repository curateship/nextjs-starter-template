-- Photos and voice notes in chats (part 17 of "facebook/01-facebook-dating"):
-- what a message is, 'text' or a photo, voice note, sticker, video or GIF.
--
-- Additions only. Nothing stored is renamed or dropped.

ALTER TABLE "date_messages"
  ADD COLUMN IF NOT EXISTS "kind" varchar(10) NOT NULL DEFAULT 'text';
