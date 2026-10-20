-- A contact can hold a note.
--
-- Tyler, 20 Oct 2026, picking the Notes box in the open contact on the
-- Contacts dashboard ("Add Notes, saves as you type"). Plain text, empty for
-- everybody who has none, so no existing row changes meaning.
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "notes" text DEFAULT '' NOT NULL;
