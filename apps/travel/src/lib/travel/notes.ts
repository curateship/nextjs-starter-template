import { emptyWrittenPageBody } from "@/lib/pages/written-page-body"
import { cleanNoteBody, noteIsEmpty, noteText, swapNoteCards, type NoteNode } from "@/lib/travel/note-blocks"

/**
 * An activity's notes are the shell's editor document, kept as JSON text, the
 * way Project keeps a task's notes (Tyler, 2 Nov 2026: "the tiptap editor like
 * in project task"). The document holds what a shell written page may, plus
 * Travel's "/" blocks (`note-blocks.ts`), so the page draws it as nodes and
 * never as stored markup.
 */
export function readNotes(stored: string): NoteNode {
  if (!stored.startsWith("{")) return emptyWrittenPageBody()
  try {
    return cleanNoteBody(JSON.parse(stored))
  } catch {
    return emptyWrittenPageBody()
  }
}

/** What is saved: "" when nothing is written, otherwise the cleaned document. */
export function storedNotes(text: string): string {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return ""
  }
  const body = cleanNoteBody(parsed)
  return noteIsEmpty(body) ? "" : JSON.stringify(body)
}

/**
 * A stored note copied onto another card. Its Place and Map blocks point at
 * the cards' copies in `ids` (Copy trip). A card with no copy goes from them,
 * so a note copied to a saved place or another trip never points back at the
 * old trip's cards.
 */
export function copiedNotes(stored: string, ids: ReadonlyMap<string, string> = new Map()): string {
  return stored ? storedNotes(JSON.stringify(swapNoteCards(readNotes(stored), ids))) : stored
}

/** A note's first line of words, as its name in the notes list and the bin, or "Empty note". */
export function noteFirstLine(stored: string) {
  const first = (readNotes(stored).content ?? []).find((block) => noteText(block).trim())
  return first ? noteText(first).trim() : "Empty note"
}
