import * as React from "react"

import { NoteEditor, NoteView } from "@/components/project/notes/note-editor"
import { useNotesBoxSetup } from "@/components/project/notes/note-setup"
import { saveAdminPage } from "@/lib/api/project/admin-dashboard"
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
 * The site admin writes in it, as they change every other part of a project.
 * Everyone else, and an archived project, reads it, and an empty page shows
 * nothing to them.
 */
export function ProjectPageNotes({ projectId, notes, canWrite }: { projectId: string; notes: string; canWrite: boolean }) {
  const save = React.useCallback((next: NoteNode) => saveProject({ projectId, notes: next }), [projectId])
  return (
    <PageNoteEditor
      stored={notes}
      canWrite={canWrite}
      placeholder="About this project. Type / for links, a callout and more."
      onSave={save}
    />
  )
}

/**
 * The site admin's own page at the top of My dashboard's left panel, under
 * the sky (Tyler, 6 Nov 2026: "add the tiptap editor with blocks ability under
 * the banner"). One page that stays, like a project's, with the same "/"
 * blocks, kept in their account. Only the site admin has it.
 */
export function AdminPageNotes({ page }: { page: string }) {
  return (
    <PageNoteEditor
      stored={page}
      canWrite
      placeholder="Your page. Type / for links, a callout and more."
      onSave={saveAdminPage}
      // The panel's own 14px, so the hint and the writing match the cards around it
      // (Tyler, 6 Nov 2026: "this label font is too big. should be the same size as
      // the actual text"). A project's page keeps its 15px.
      small
    />
  )
}

/**
 * A page of the project's own, written in place with the "/" blocks a project
 * may hold: the project's page above, and each of its notes
 * (`project-notes-panel.tsx`). It saves 700ms after the last letter and when
 * it's left. While it's open it is never drawn again from what was saved, so a
 * late save can't take back what was just written. A save that fails says why
 * and is tried again with the next letter or when the page is left.
 * Read-only, an empty page shows nothing.
 */
export function PageNoteEditor({
  stored,
  canWrite,
  placeholder,
  onSave,
  onSaved,
  startFocused = false,
  small = false,
}: {
  stored: string
  canWrite: boolean
  placeholder: string
  onSave: (body: NoteNode) => Promise<unknown>
  /** Told what was saved, as it is kept, once the server took it. */
  onSaved?: (stored: string) => void
  /** Puts the cursor in it as it opens, for a note just made. */
  startFocused?: boolean
  /** Writes at the panel's 14px instead of a page's 15px. */
  small?: boolean
}) {
  const setup = useNotesBoxSetup("project")
  const [start] = React.useState(() => notesForEditor(readTaskNotes(stored)))
  const saved = React.useRef(storedTaskNotes(start))
  const draft = React.useRef<NoteNode | null>(null)
  const timer = React.useRef(0)
  const box = React.useRef<HTMLDivElement>(null)
  // The latest handlers, so a save started by a timer uses them as they are now.
  const handlers = React.useRef({ onSave, onSaved })
  React.useEffect(() => {
    handlers.current = { onSave, onSaved }
  })

  const flush = React.useCallback(() => {
    window.clearTimeout(timer.current)
    const next = draft.current
    if (!next) return
    draft.current = null
    const kept = storedTaskNotes(next)
    if (kept === saved.current) return
    saved.current = kept
    handlers.current.onSave(next).then(
      () => handlers.current.onSaved?.(kept),
      (error: unknown) => {
        // Kept to try again with the next letter or when the page is left.
        saved.current = ""
        draft.current = next
        showErrorToast(getProjectErrorMessage(error))
      }
    )
  }, [])

  // Leaving the page saves what was typed.
  React.useEffect(() => flush, [flush])

  // The shell's editor appears a moment after the box, so the cursor waits for it.
  React.useEffect(() => {
    if (!startFocused || !canWrite) return
    let frame = 0
    let tries = 0
    const place = () => {
      const editable = box.current?.querySelector<HTMLElement>("[contenteditable=true]")
      if (editable) editable.focus()
      else if (tries++ < 30) frame = requestAnimationFrame(place)
    }
    frame = requestAnimationFrame(place)
    return () => cancelAnimationFrame(frame)
  }, [startFocused, canWrite])

  if (!canWrite) {
    const read = readTaskNotes(stored)
    if (taskNotesAreEmpty(read)) return null
    return <NoteView setup={setup} body={notesForEditor(read)} />
  }

  return (
    <div
      ref={box}
      data-notes-editor=""
      className={cn(
        "relative",
        // A plain writing area, no box: the panel around it is the page.
        "[&_[data-note-box]>div:first-of-type]:rounded-none [&_[data-note-box]>div:first-of-type]:border-0 [&_[data-note-box]>div:first-of-type]:bg-transparent",
        "[&_.page-rte_.tiptap]:!min-h-[calc(3.3em+1.25rem)] [&_.page-rte_.tiptap]:!px-0 [&_.page-rte_.tiptap]:!pt-0 [&_.page-rte_.tiptap]:!pb-2",
        small
          ? "[&_.page-rte_.tiptap]:!text-sm [&_.page-rte_.tiptap]:!leading-[1.6]"
          : "[&_.page-rte_.tiptap]:!text-[0.9375rem] [&_.page-rte_.tiptap]:!leading-[1.65]"
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
        placeholder={placeholder}
        onChange={(body) => {
          draft.current = body
          window.clearTimeout(timer.current)
          timer.current = window.setTimeout(flush, TYPING_SAVE_MS)
        }}
      />
    </div>
  )
}
