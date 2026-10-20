-- Three small columns and four more import sources for the Library, 20 Oct 2026.
--
-- note_folders.pinned_at: a pinned folder sits in the Pinned card above the
-- LIBRARY card of its library's left panel, earliest pinned first (Tyler,
-- 20 Oct 2026: "Pin a folder"). Empty means not pinned.
--
-- note_notes.played_seconds: where the saved video or sound was stopped, so it
-- starts there again the next time the note is opened. Empty means from the
-- start.
--
-- note_notes.source: Threads, LinkedIn, Facebook and Reddit join the Import
-- menu (Tyler, 20 Oct 2026). Threads is read as words, as X is; the other
-- three are saved as videos, the way YouTube and TikTok are.

ALTER TABLE note_folders ADD COLUMN IF NOT EXISTS pinned_at timestamp with time zone;
ALTER TABLE note_notes ADD COLUMN IF NOT EXISTS played_seconds integer;

ALTER TABLE note_notes DROP CONSTRAINT IF EXISTS ck_note_notes_source;
ALTER TABLE note_notes ADD CONSTRAINT ck_note_notes_source CHECK (
  source IN ('note', 'youtube_long', 'youtube_short', 'instagram', 'tiktok', 'x', 'threads', 'linkedin', 'facebook', 'reddit')
);

-- note_libraries.pinned_rows: the LIBRARY card's own rows (All notes, Loose
-- notes, Plan steps, Quotes, Archived, Trash) pinned to the Pinned card, each
-- with when, in the order pinned (Tyler, 20 Oct 2026: "I should be able to
-- pin library folders too").
ALTER TABLE note_libraries ADD COLUMN IF NOT EXISTS pinned_rows jsonb NOT NULL DEFAULT '[]'::jsonb;
