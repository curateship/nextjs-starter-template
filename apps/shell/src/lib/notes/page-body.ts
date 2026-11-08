import { emptyWrittenPageBody } from "@/lib/pages/written-page-body"
import { cleanNoteBody, noteIsEmpty, type NoteNode } from "@/lib/notes/note-blocks"

/**
 * A page in the Admin 3 panel design is the shell's editor document kept as
 * JSON text, as Trade and Travel keep theirs (copied from Trade's
 * `trade-pages.ts`, 7 Nov 2026). `appBlockTypes` are the app's own block node
 * names the page may hold; the editor and the server pass the same list.
 */

/** The longest a stored page may be, in characters of JSON. */
export const PAGE_MAX_LENGTH = 200_000

/** A page's stored words read back and cleaned; "" or anything unreadable is an empty page. */
export function readPageBody(stored: string, appBlockTypes: readonly string[] = []): NoteNode {
  if (!stored.startsWith("{")) return emptyWrittenPageBody()
  try {
    return cleanNoteBody(JSON.parse(stored), appBlockTypes)
  } catch {
    return emptyWrittenPageBody()
  }
}

/** What is saved: "" when nothing is written, otherwise the cleaned document. */
export function storedPageBody(text: string, appBlockTypes: readonly string[] = []): string {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return ""
  }
  const body = cleanNoteBody(parsed, appBlockTypes)
  return noteIsEmpty(body, appBlockTypes) ? "" : JSON.stringify(body)
}

/** One page as a screen holds it. */
export type StoredPage = {
  /** The saved document as JSON text, or the starting page when none was saved. */
  body: string
  locked: boolean
  /** None, `SKY_COVER`, or a picture (`src/lib/notes/page-cover.ts`). */
  coverUrl: string | null
  /** The page's own pictures, each a tile in the Cover photo row. */
  coverImages: string[]
}
