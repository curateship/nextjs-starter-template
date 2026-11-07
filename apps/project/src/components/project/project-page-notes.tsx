import * as React from "react"
import type { Editor } from "@tiptap/core"

import { NoteEditor, NoteView } from "@/components/project/notes/note-editor"
import { useNotesBoxSetup } from "@/components/project/notes/note-setup"
import { saveAdminPage } from "@/lib/api/project/admin-dashboard"
import { saveProject } from "@/lib/api/project/projects"
import { saveTeamPage } from "@/lib/api/project/teams"
import { getProjectErrorMessage } from "@/lib/project/errors"
import type { NoteNode } from "@/lib/project/note-blocks"
import { notesForEditor, readTaskNotes, storedTaskNotes, taskNotesAreEmpty } from "@/lib/project/notes"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

/**
 * On a left panel's page (My dashboard's and a team's, both `small`), the
 * space between two blocks is the panel's own 15px edge, so the cards stand
 * as far from each other as from the panel's sides (Tyler, 7 Nov 2026: "Make
 * the gutter equal to the left and right"). Writing takes the blocks' margins,
 * which meet in one 15px gap; reading, the reader's grid gap.
 */
const BLOCK_GAP_WRITING = "[&_.tiptap_[data-note-block]]:my-3.75"
const BLOCK_GAP_READING = "[&>.grid]:gap-3.75"

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
 * blocks, kept in their account. Only the site admin has it, and only it
 * offers Projects, Habit, Rating calendar and Rating trend (task "My
 * dashboard/left-panel-blocks", 6 Nov 2026). Those draw from the dashboard
 * through `DashboardBlocksProvider`.
 */
export function AdminPageNotes({ page, locked }: { page: string; locked: boolean }) {
  return (
    <PageNoteEditor
      // Locking or unlocking draws it again, writable or not.
      key={String(locked)}
      stored={page}
      // Locked in My settings, it reads only, blocks and all (Tyler, 6 Nov 2026: "lock the notes option is missing").
      canWrite={!locked}
      where="dashboard"
      placeholder="Your page. Type / for projects, habits, links and more."
      onSave={saveAdminPage}
      // The panel's own 14px, so the hint and the writing match the cards around it
      // (Tyler, 6 Nov 2026: "this label font is too big. should be the same size as
      // the actual text"). A project's page keeps its 15px.
      small
    />
  )
}

/**
 * A team's own page at the top of the Team dashboard's left panel, under its
 * cover (task "Team dashboard/admin-3-panel-design", Tyler, 7 Nov 2026). One
 * page that stays, with the "/" blocks a project's page has plus the team's
 * own: Check-ins, Workload, Attention, This week and Members, drawn from the
 * dashboard through `TeamBlocksProvider`. Only the site admin writes it
 * ("Cover stays; you write", his pick); every member reads it, blocks and all.
 */
export function TeamPageNotes({
  page,
  locked,
  canWrite,
  teamId,
}: {
  page: string
  /** Locked in Team settings, it reads only, even for the site admin. */
  locked: boolean
  canWrite: boolean
  teamId: string | undefined
}) {
  const save = React.useCallback((next: NoteNode) => saveTeamPage(next, teamId), [teamId])
  return (
    <PageNoteEditor
      // Locking or unlocking draws it again, writable or not.
      key={String(locked)}
      stored={page}
      canWrite={canWrite && !locked}
      where="team"
      placeholder="The team's page. Type / for check-ins, workload and more."
      onSave={save}
      small
    />
  )
}

/**
 * A click above a page that starts with a block, such as the Daily card, puts
 * a new line there and the cursor in it (Tyler, 7 Nov 2026: "i cant click at
 * the very upper editor here to insert content because the block is in it").
 * On a page that starts with writing, the click puts the cursor at its start.
 */
function lineAbove(event: React.MouseEvent<HTMLDivElement>) {
  // Only the strip itself, never a click passed up from inside the page or from
  // a menu or dialog it opened, which React passes up through this box too.
  if (event.target !== event.currentTarget) return
  const area = event.currentTarget.querySelector<HTMLElement & { editor?: Editor }>(".tiptap")
  const editor = area?.editor
  const first = area?.firstElementChild
  if (!editor || editor.isDestroyed || !editor.isEditable || !first) return
  if (event.clientY >= first.getBoundingClientRect().top) return
  event.preventDefault()
  const chain = editor.chain()
  if (!editor.state.doc.firstChild?.isTextblock) chain.insertContentAt(0, { type: "paragraph" })
  chain.setTextSelection(1).focus().run()
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
  where = "project",
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
  /**
   * A project's page or note, the site admin's own page, which keeps the
   * dashboard blocks, or a team's page, which keeps the team blocks.
   */
  where?: "project" | "dashboard" | "team"
}) {
  const setup = useNotesBoxSetup(where)
  const rules = { dashboard: where === "dashboard", team: where === "team" }
  const [start] = React.useState(() => notesForEditor(readTaskNotes(stored, rules)))
  const saved = React.useRef(storedTaskNotes(start, rules))
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
    const kept = storedTaskNotes(next, { dashboard: where === "dashboard", team: where === "team" })
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
  }, [where])

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
    const read = readTaskNotes(stored, rules)
    if (taskNotesAreEmpty(read)) return null
    return (
      <div className={small ? BLOCK_GAP_READING : undefined}>
        <NoteView setup={setup} body={notesForEditor(read)} />
      </div>
    )
  }

  return (
    <div
      ref={box}
      data-notes-editor=""
      className={cn(
        "relative",
        // The panel's edge above the page, 12px, takes a click too (see `lineAbove`).
        "before:absolute before:inset-x-0 before:-top-3 before:h-3 before:cursor-text before:content-['']",
        // A plain writing area, no box: the panel around it is the page.
        "[&_[data-note-box]>div:first-of-type]:rounded-none [&_[data-note-box]>div:first-of-type]:border-0 [&_[data-note-box]>div:first-of-type]:bg-transparent",
        "[&_.page-rte_.tiptap]:!min-h-[calc(3.3em+1.25rem)] [&_.page-rte_.tiptap]:!px-0 [&_.page-rte_.tiptap]:!pt-0 [&_.page-rte_.tiptap]:!pb-2",
        small
          ? cn("[&_.page-rte_.tiptap]:!text-sm [&_.page-rte_.tiptap]:!leading-[1.6]", BLOCK_GAP_WRITING)
          : "[&_.page-rte_.tiptap]:!text-[0.9375rem] [&_.page-rte_.tiptap]:!leading-[1.65]"
      )}
      onMouseDown={lineAbove}
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
