import { taskNotesText } from "@/lib/project/notes"

/** What a note with no words yet is called in the list, the Bin and a # link. */
const EMPTY_NOTE_TITLE = "Empty note"

/**
 * A project note's name: its first line of words. A # link's words are left
 * out, because they are a title as it was written, which not every reader of
 * the note's name may see. Blocks such as a picture have no words, so a note
 * that starts with one is named by its first line under it.
 */
export function noteTitle(stored: string): string {
  const first = taskNotesText(stored)
    .split("\n")
    .find((line) => line.trim())
  return first ? first.trim().slice(0, 200) : EMPTY_NOTE_TITLE
}
