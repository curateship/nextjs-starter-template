import * as React from "react"

import { NoteEditor, NoteView } from "@/components/project/notes/note-editor"
import { useNotesBoxSetup } from "@/components/project/notes/note-setup"
import { saveProject } from "@/lib/api/project/projects"
import { getProjectErrorMessage } from "@/lib/project/errors"
import type { NoteNode } from "@/lib/project/note-blocks"
import { notesForEditor, readTaskNotes, storedTaskNotes, taskNotesAreEmpty } from "@/lib/project/notes"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

/** A pause in typing this long saves (UI standard, "Settings"). */
const TYPING_SAVE_MS = 700

/**
 * The project's page at the top of its left panel, where the avatar was
 * (Tyler, 5 Nov 2026: "Where the avatar used to be. Add the tiptap editor with
 * a couple of blocks like a links block and call out block"). It is the notes
 * editor with its "/" blocks, Links and Callout among them, less File and the
 * Video or Promo card, which belong to a task. It has no + beside its lines
 * (Tyler, 5 Nov 2026: "Remove the + hover over icon"); "/" opens the list.
 *
 * The site admin writes in it, as they change every other part of a project;
 * it saves 700ms after the last letter and when it's left. Everyone else, and
 * an archived project, reads it, and an empty page shows nothing to them.
 * While it's open it is never drawn again from what was saved, so a late
 * save can't take back what was just written.
 */
export function ProjectPageNotes({ projectId, notes, canWrite }: { projectId: string; notes: string; canWrite: boolean }) {
  const setup = useNotesBoxSetup("project")
  const [start] = React.useState(() => notesForEditor(readTaskNotes(notes)))
  const saved = React.useRef(storedTaskNotes(start))
  const draft = React.useRef<NoteNode | null>(null)
  const timer = React.useRef(0)

  const flush = React.useCallback(() => {
    window.clearTimeout(timer.current)
    const next = draft.current
    if (!next) return
    draft.current = null
    const stored = storedTaskNotes(next)
    if (stored === saved.current) return
    saved.current = stored
    saveProject({ projectId, notes: next }).catch((error: unknown) => {
      // Kept to try again with the next letter or when the page is left.
      saved.current = ""
      draft.current = next
      showErrorToast(getProjectErrorMessage(error))
    })
  }, [projectId])

  // Leaving the project saves what was typed.
  React.useEffect(() => flush, [flush])

  if (!canWrite) {
    const read = readTaskNotes(notes)
    if (taskNotesAreEmpty(read)) return null
    return <NoteView setup={setup} body={notesForEditor(read)} />
  }

  return (
    <div
      data-notes-editor=""
      className={cn(
        "relative",
        // A plain writing area, no box: the panel around it is the page.
        "[&_[data-note-box]>div:first-of-type]:rounded-none [&_[data-note-box]>div:first-of-type]:border-0 [&_[data-note-box]>div:first-of-type]:bg-transparent",
        "[&_.page-rte_.tiptap]:!min-h-[calc(3.3em+1.25rem)] [&_.page-rte_.tiptap]:!px-0 [&_.page-rte_.tiptap]:!pt-0 [&_.page-rte_.tiptap]:!pb-2",
        "[&_.page-rte_.tiptap]:!text-[0.9375rem] [&_.page-rte_.tiptap]:!leading-[1.65]"
      )}
      onBlur={(event) => {
        const next = event.relatedTarget
        // The link box, the "/" list and a block's menu sit outside the writing area.
        if (next instanceof Element && (event.currentTarget.contains(next) || next.closest("[data-radix-popper-content-wrapper], [data-slot=popover-content]"))) {
          return
        }
        flush()
      }}
    >
      <NoteEditor
        setup={setup}
        value={start}
        placeholder="About this project. Type / for links, a callout and more."
        onChange={(body) => {
          draft.current = body
          window.clearTimeout(timer.current)
          timer.current = window.setTimeout(flush, TYPING_SAVE_MS)
        }}
      />
    </div>
  )
}
