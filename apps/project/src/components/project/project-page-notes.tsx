import * as React from "react"
import type { Editor } from "@tiptap/core"

import { NoteEditor, NoteView } from "@/components/project/notes/note-editor"
import { useNotesBoxSetup } from "@/components/project/notes/note-setup"
import { saveAdminPage } from "@/lib/api/project/admin-dashboard"
import { saveProject } from "@/lib/api/project/projects"
import { saveTeamPage } from "@/lib/api/project/teams"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { noteIsEmpty, type NoteNode } from "@/lib/project/note-blocks"
import { notesForEditor, readTaskNotes, storedTaskNotes, taskNotesAreEmpty } from "@/lib/project/notes"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

/**
 * Blocks on a page, as the shell's pages place them (`saving-document.tsx`):
 * a block stands 15px from written text, the panel's own edge (Tyler, 7 Nov
 * 2026: "Make the gutter equal to the left and right"), and two blocks in a
 * row sit flush, one straight under the other (Tyler, 11 Nov 2026, of the
 * shell's: "remove the spacing here", then "the same for left panels too";
 * and of Project's page, the same day: "therees still this gap"). A block
 * that opens the page sits straight under the panel's header. Plain CSS
 * rather than classes, so it wins over a block frame's own `my-2`. Writing,
 * the editor's blocks carry the margins; reading, the reader's grid has no
 * gap and a block takes 15px beside written text.
 */
const PAGE_BLOCK_STYLES = `
  [data-page-notes] .tiptap [data-note-block] { margin-top: 15px; margin-bottom: 15px; }
  [data-page-notes] .tiptap > .react-renderer:first-child [data-note-block] { margin-top: 0; }
  [data-page-notes] .tiptap > .react-renderer:has(+ .react-renderer) [data-note-block] { margin-bottom: 0; }
  [data-page-notes] .tiptap > .react-renderer + .react-renderer [data-note-block] { margin-top: 0; }
  [data-page-notes] > .grid { gap: 0; }
  [data-page-notes] > .grid > :not([data-note-block]) + [data-note-block],
  [data-page-notes] > .grid > [data-note-block] + :not([data-note-block]) { margin-top: 15px; }
  /* The last block reaching the panel's bottom (block-heights.ts) stops
     above the editor's empty last line, which stays a line to click and
     write on (Tyler, 12 Nov 2026: "I cant click under the left card bottom
     to enter to editior"), unlike Trade's page, which takes it away. */
  [data-page-notes] .tiptap [data-note-block]:has(.project-block-fills) { margin-bottom: 0; }
  /* Panel cards -> Opacity on a page read rather than written (locked, or
     not the reader's to change): theme.css finds the first block inside the
     editor only, so the reader's first block gets the same rule. */
  [data-side-panel-body] [data-page-notes] > .grid > [data-note-block]:first-child [data-block-card] {
    background: color-mix(
      in oklab,
      color-mix(in oklab, var(--muted) var(--shell-block-shade, 50%), var(--card))
        calc(0.6 * var(--shell-panel-first-opacity, 100%)),
      transparent
    );
    backdrop-filter: blur(var(--shell-panel-first-blur, 12px));
  }
  [data-side-panel-body] [data-page-notes] > .grid > [data-note-block]:first-child [data-block-card] [data-block-tile] {
    --block-body: color-mix(
      in oklab,
      color-mix(in oklab, var(--muted) var(--shell-block-body-shade, 0%), var(--card))
        var(--shell-panel-first-opacity, 100%),
      transparent
    );
  }
`

/**
 * A page read only, less the empty lines at its very top and bottom. Read,
 * they draw nothing but space: one above the first block left a white gap
 * under the panel's header and kept that block from being the page's first,
 * so Panel cards → Opacity missed it (Tyler, 12 Nov 2026: "theres a white gap
 * here", "the header is not wired to the panel card setting"). The editor
 * keeps them, so they are still there to write on once the page is unlocked.
 */
function withoutEmptyEdges(body: NoteNode): NoteNode {
  const content = [...(body.content ?? [])]
  const blank = (node: NoteNode | undefined) => node?.type === "paragraph" && noteIsEmpty(node)
  while (blank(content[0])) content.shift()
  while (blank(content.at(-1))) content.pop()
  return { ...body, content }
}

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
      where="projectPage"
      placeholder="About this project. Type / for milestones, links and more."
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
   * A project's note, a project's own page, which keeps Milestones, the site
   * admin's own page, which keeps the dashboard blocks, or a team's page,
   * which keeps the team blocks.
   */
  where?: "project" | "projectPage" | "dashboard" | "team"
}) {
  const setup = useNotesBoxSetup(where)
  const rules = { dashboard: where === "dashboard", team: where === "team", projectPage: where === "projectPage" }
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
    const kept = storedTaskNotes(next, { dashboard: where === "dashboard", team: where === "team", projectPage: where === "projectPage" })
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
      <div data-page-notes="">
        <style>{PAGE_BLOCK_STYLES}</style>
        <NoteView setup={setup} body={withoutEmptyEdges(notesForEditor(read))} />
      </div>
    )
  }

  return (
    <div
      ref={box}
      data-notes-editor=""
      data-page-notes=""
      className={cn(
        "relative",
        // The panel's edge above the page, 12px, takes a click too (see `lineAbove`).
        "before:absolute before:inset-x-0 before:-top-3 before:h-3 before:cursor-text before:content-['']",
        // A plain writing area, no box: the panel around it is the page.
        "[&_[data-note-box]>div:first-of-type]:rounded-none [&_[data-note-box]>div:first-of-type]:border-0 [&_[data-note-box]>div:first-of-type]:bg-transparent",
        "[&_.page-rte_.tiptap]:!min-h-[calc(3.3em+1.25rem)] [&_.page-rte_.tiptap]:!px-0 [&_.page-rte_.tiptap]:!pt-0 [&_.page-rte_.tiptap]:!pb-2",
        small
          ? "[&_.page-rte_.tiptap]:!text-sm [&_.page-rte_.tiptap]:!leading-[1.6]"
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
      <style>{PAGE_BLOCK_STYLES}</style>
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
