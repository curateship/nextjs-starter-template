import { Extension, type Editor } from "@tiptap/core"

import { linkQueryBefore } from "@/lib/project/mentions"

/** What is typed after a # in the notes, and where, so the list can sit under it. */
export type NotesLinkTyping = {
  editor: Editor
  typed: string
  /** The # and what follows it, which a pick replaces. */
  from: number
  to: number
  /** Where the # is on screen. */
  left: number
  bottom: number
}

/**
 * Typing # in a task's notes lists tasks to link (`task-notes.tsx` draws the
 * list). This only reports what is typed after the # and passes the list's
 * keys on: arrows move, Enter or Tab picks, Escape closes. `onKey` answers
 * true when the list took the key, so the editor doesn't also act on it.
 */
export function notesTaskLinks(handlers: {
  onTyping: (typing: NotesLinkTyping | null) => void
  onKey: (key: "up" | "down" | "pick" | "close") => boolean
}) {
  const report = (editor: Editor) => {
    const { selection } = editor.state
    if (!selection.empty) return handlers.onTyping(null)
    const { $from } = selection
    const typed = linkQueryBefore($from.parent.textBetween(0, $from.parentOffset, undefined, "￼"))
    if (typed === null) return handlers.onTyping(null)
    const from = selection.from - typed.length - 1
    const at = editor.view.coordsAtPos(from)
    handlers.onTyping({ editor, typed, from, to: selection.from, left: at.left, bottom: at.bottom })
  }
  return Extension.create({
    name: "projectNotesTaskLinks",
    // Ahead of the editor's own Enter, so a pick doesn't also start a new line.
    priority: 1000,
    onUpdate() {
      report(this.editor)
    },
    onSelectionUpdate() {
      report(this.editor)
    },
    onBlur() {
      handlers.onTyping(null)
    },
    addKeyboardShortcuts() {
      return {
        ArrowDown: () => handlers.onKey("down"),
        ArrowUp: () => handlers.onKey("up"),
        Enter: () => handlers.onKey("pick"),
        Tab: () => handlers.onKey("pick"),
        Escape: () => handlers.onKey("close"),
      }
    },
  })
}
