-- Folders, the Pinned, Authors and Recently opened blocks went from the
-- Library dashboard (Tyler, 15 Nov 2026: "remove the pinned block and move
-- them as middle tab", "Remove folder block and folder feature. Remove the
-- authors block. Remove the recenetly opened block").
--
-- Pinned notes are a middle tab now and keep their `pinned_at`. What only the
-- removed parts used goes, with its data: every folder and each note's folder,
-- the old LIBRARY card's pinned rows, and the time each note was last opened,
-- which only Recently opened read.
ALTER TABLE "note_notes" DROP COLUMN IF EXISTS "folder_id";
DROP TABLE IF EXISTS "note_folders";
ALTER TABLE "note_libraries" DROP COLUMN IF EXISTS "pinned_rows";
ALTER TABLE "note_notes" DROP COLUMN IF EXISTS "last_opened_at";
