import * as React from "react"
import { createPortal } from "react-dom"
import { ArrowLeftIcon, CopyIcon, Loader2Icon, NotebookPenIcon, PlusIcon, Trash2Icon } from "lucide-react"

import { SavingDocument } from "@/components/travel/saving-document"
import { useTrip } from "@/components/travel/trip-context"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ScrollArea } from "@/components/ui/scroll-area"
import { copyNote, newTripNote, removeNote, saveNote } from "@/lib/api/travel/trip-notes"
import type { TripNote } from "@/lib/api/travel/trips"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { writtenPageText } from "@/lib/pages/written-page-body"
import { formatLongDate } from "@/lib/travel/dates"
import { getTravelErrorMessage } from "@/lib/travel/errors"
import { readNotes } from "@/lib/travel/notes"

/** A note's first line, as its name in the list. */
function firstLine(body: string) {
  const first = (readNotes(body).content ?? []).find((block) => writtenPageText(block).trim())
  return first ? writtenPageText(first).trim() : "Empty note"
}

/** A point on the page for a menu to open from, in the page's body so no scroller shifts it off the mouse. */
const PointAnchor = React.forwardRef<HTMLSpanElement, { x: number; y: number }>(function PointAnchor(
  { x, y, ...props },
  ref
) {
  return createPortal(
    <span ref={ref} aria-hidden {...props} className="pointer-events-none fixed size-0" style={{ left: x, top: y }} />,
    document.body
  )
})

/**
 * The trip's notes, filling the left panel under the trip's header while its
 * note icon is an × (Tyler, 2 and 3 Nov 2026). With none yet, the panel is one
 * place to press that makes the first note. With some, they're listed by first
 * line and the day they last changed, newest first, with New note under them.
 * Right-click a note for Duplicate and Delete (Tyler, 3 Nov 2026: "add right
 * click feature to delete and duplicate note in the notes list"). An open note
 * is the shell's editor, saving itself, with Back to notes right under it.
 */
export function TripNotes() {
  const { page, refresh } = useTrip()
  const [openId, setOpenId] = React.useState<string | null>(null)
  const [justMade, setJustMade] = React.useState<string | null>(null)
  const [deleting, setDeleting] = React.useState<TripNote | null>(null)
  const [menu, setMenu] = React.useState<{ note: TripNote; at: { x: number; y: number } } | null>(null)
  const [run, busy] = useAsyncAction(getTravelErrorMessage)
  // Saving as it's written has its own, so typing never spins New note.
  const [runSave] = useAsyncAction(getTravelErrorMessage)
  const open = openId ? page.notes.find((note) => note.id === openId) : undefined

  async function create() {
    let id = ""
    const ok = await run(async () => {
      id = (await newTripNote(page.trip.id)).id
      await refresh()
    })
    if (!ok) return
    setJustMade(id)
    setOpenId(id)
  }

  async function duplicate(note: TripNote) {
    await run(async () => {
      await copyNote(note.id)
      await refresh()
    }, "Note duplicated.")
  }

  async function remove(note: TripNote) {
    const ok = await run(async () => {
      await removeNote(note.id)
      await refresh()
    }, "Note deleted.")
    if (ok) setDeleting(null)
  }

  let body: React.ReactNode
  if (open) {
    body = (
      <div className="grid gap-1">
      <SavingDocument
        key={open.id}
        value={open.body}
        focus={justMade === open.id}
        onSave={(text) =>
          runSave(async () => {
            await saveNote(open.id, text)
            await refresh()
          })
        }
      />
        {/* Right under the note (Tyler, 3 Nov 2026: "add a link here that says Back to notes"). */}
        <div>
          <Button type="button" variant="link" size="sm" className="px-1" onClick={() => setOpenId(null)}>
            <ArrowLeftIcon className="size-4" />
            Back to notes
          </Button>
        </div>
      </div>
    )
  } else if (page.notes.length === 0) {
    body = (
      <button
        type="button"
        disabled={busy}
        onClick={() => void create()}
        className="grid min-h-48 w-full content-center justify-items-center gap-2 rounded-lg border border-dashed p-6 text-center text-muted-foreground hover:bg-accent/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
      >
        {busy ? <Loader2Icon className="size-5 animate-spin" aria-hidden /> : <NotebookPenIcon className="size-5" aria-hidden />}
        <span className="text-sm font-medium text-foreground">Add a note</span>
        <span className="max-w-56 text-xs">Keep ideas, links and lists for this trip.</span>
      </button>
    )
  } else {
    body = (
      <div className="grid gap-2">
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-1">
          {page.notes.map((note) => (
            <li key={note.id}>
              <button
                type="button"
                data-note-id={note.id}
                onClick={() => setOpenId(note.id)}
                onContextMenu={(event) => {
                  event.preventDefault()
                  setMenu({ note, at: { x: event.clientX, y: event.clientY } })
                }}
                className="grid w-full min-w-0 gap-0.5 rounded-md px-2 py-2 text-left hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <span className="truncate text-sm font-medium">{firstLine(note.body)}</span>
                <span className="text-xs text-muted-foreground">{formatLongDate(note.updatedAt.slice(0, 10))}</span>
              </button>
            </li>
          ))}
        </ul>
        <Button type="button" variant="outline" className="w-full" disabled={busy} onClick={() => void create()}>
          {busy ? <Loader2Icon className="size-4 animate-spin" /> : <PlusIcon className="size-4" />}
          New note
        </Button>
      </div>
    )
  }

  return (
    <>
      <ScrollArea className="relative min-h-0 flex-1" viewportClassName="h-full">
        <div className="p-3">{body}</div>
      </ScrollArea>
      {menu ? (
        // Not modal, so a right-click on another note moves the menu there in one go.
        <DropdownMenu open onOpenChange={(next) => (next ? undefined : setMenu(null))} modal={false}>
          <DropdownMenuTrigger asChild>
            <PointAnchor x={menu.at.x} y={menu.at.y} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-44" onCloseAutoFocus={(event) => event.preventDefault()}>
            <DropdownMenuItem onSelect={() => void duplicate(menu.note)}>
              <CopyIcon className="size-4" />
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(menu.note)}>
              <Trash2Icon className="size-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(next) => (next ? undefined : setDeleting(null))}
        title={`Delete "${deleting ? firstLine(deleting.body) : "this note"}"?`}
        description="The note goes for good."
        confirmLabel="Delete note"
        destructive
        loading={busy}
        onConfirm={() => (deleting ? void remove(deleting) : undefined)}
      />
    </>
  )
}
