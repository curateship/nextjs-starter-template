/**
 * The one line about what a finished focus was for.
 *
 * The cap lives here rather than in the server module because the prompt, the
 * request validator and the database column all have to agree on it, and the
 * prompt runs in the browser where `@/server/*` may never be imported.
 *
 * 120 characters is a line in a History table cell, not a journal entry. The
 * limit is what keeps the row readable at a glance six weeks later.
 */
export const SESSION_NOTE_MAX_LENGTH = 120

/** What actually gets stored: trimmed, capped, and empty means no note. */
export function normalizeSessionNote(note: string) {
  return note.trim().slice(0, SESSION_NOTE_MAX_LENGTH)
}
