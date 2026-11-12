import * as React from "react"
import { createPortal } from "react-dom"
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import {
  ArrowLeftIcon,
  CopyIcon,
  GripVerticalIcon,
  Loader2Icon,
  NotebookPenIcon,
  PinIcon,
  PinOffIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react"

import { PageNoteEditor } from "@/components/project/project-page-notes"
import { PersonAvatar } from "@/components/project/task-bits"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ErrorRow } from "@/components/ui/error-row"
import { LoadingRow } from "@/components/ui/loading-row"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  deleteNote,
  duplicateNote,
  loadProjectNotes,
  moveNote,
  newProjectNote,
  pinNote,
  saveNote,
  type ProjectNote,
  type ProjectNotesList,
} from "@/lib/api/project/project-notes"
import { formatDate } from "@/lib/format/format-time"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { focusRingInset } from "@/lib/layout/focus-ring"
import { getProjectErrorMessage } from "@/lib/project/errors"
import type { NoteNode } from "@/lib/project/note-blocks"
import { noteTitle } from "@/lib/project/project-notes"
import { cn } from "@/lib/utils"

type Loaded = { state: "loading" } | { state: "error"; message: string } | { state: "ready"; list: ProjectNotesList }

/** Hidden until the row is pointed at or holds the keyboard's focus; always shown on a phone. */
const QUIET =
  "opacity-0 transition-opacity group-hover/note:opacity-100 group-has-[:focus-visible]/note:opacity-100 [@media(hover:none)]:opacity-100"

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
 * The project's notes, filling the left panel under the project's header
 * while its note icon is an × (task "Project notes"; Tyler, 6 Nov 2026: "Add
 * a note feature here ... like in travel app"). Copied from Travel's trip
 * notes: with none yet, the panel is one place to press that makes the first
 * note; with some, they're listed pinned first, then in the order the
 * project's people dragged them into, with New note under them. Right-click a
 * note to pin it, duplicate it or delete it; Delete puts it in the project's
 * bin with Undo and doesn't ask ("Bin with Undo, no ask"). An open note is
 * the project page's own editor, saving itself, with Back to notes under it.
 *
 * Everyone who can see the project sees and writes all its notes. There are
 * no private notes (Tyler, 6 Nov 2026: "remove the privacy feature").
 */
export function ProjectNotes({
  projectId,
  startOpen = null,
}: {
  projectId: string
  /** A note to open at once, from a # link. */
  startOpen?: string | null
}) {
  const [loaded, setLoaded] = React.useState<Loaded>({ state: "loading" })
  const [reloads, setReloads] = React.useState(0)
  const [openId, setOpenId] = React.useState<string | null>(startOpen)
  const [justMade, setJustMade] = React.useState<string | null>(null)
  const [menu, setMenu] = React.useState<{ note: ProjectNote; at: { x: number; y: number } } | null>(null)
  const [run, busy] = useAsyncAction(getProjectErrorMessage)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )
  const dndId = React.useId()

  React.useEffect(() => {
    let live = true
    loadProjectNotes(projectId).then(
      (list) => live && setLoaded({ state: "ready", list }),
      (error: unknown) => live && setLoaded({ state: "error", message: getProjectErrorMessage(error) })
    )
    return () => {
      live = false
    }
  }, [projectId, reloads])

  const reload = () => setReloads((n) => n + 1)

  if (loaded.state === "loading") {
    return (
      <PanelBody>
        <LoadingRow label="Loading the notes…" />
      </PanelBody>
    )
  }
  if (loaded.state === "error") {
    return (
      <PanelBody>
        <ErrorRow message={loaded.message} onRetry={reload} />
      </PanelBody>
    )
  }

  const list = loaded.list
  const { notes, canWrite } = list
  const open = openId ? notes.find((note) => note.id === openId) : undefined

  /** Keeps a saved note's words in the list, so going back shows them at once. */
  function keep(noteId: string, stored: string) {
    setLoaded((was) =>
      was.state === "ready"
        ? {
            state: "ready",
            list: {
              ...was.list,
              notes: was.list.notes.map((note) =>
                note.id === noteId
                  ? { ...note, body: stored, title: noteTitle(stored), updatedAt: new Date().toISOString() }
                  : note
              ),
            },
          }
        : was
    )
  }

  /** Opens the new note together with a list that holds it, so it never reads as missing. */
  async function create() {
    await run(async () => {
      const { id } = await newProjectNote(projectId)
      const fresh = await loadProjectNotes(projectId)
      setLoaded({ state: "ready", list: fresh })
      setJustMade(id)
      setOpenId(id)
    })
  }

  async function remove(note: ProjectNote) {
    if (!(await run(() => deleteNote(note.id)))) return
    if (openId === note.id) setOpenId(null)
    reload()
  }

  async function change(work: () => Promise<unknown>) {
    if (await run(work)) reload()
  }

  /** A note dropped on another in its own group goes just before or after it, as the drag showed. */
  function drop(event: DragEndEvent) {
    const overId = event.over?.id
    if (overId === undefined || overId === event.active.id) return
    const moved = notes.find((note) => note.id === event.active.id)
    const over = notes.find((note) => note.id === overId)
    if (!moved || !over || moved.pinned !== over.pinned) return
    const group = notes.filter((note) => note.pinned === moved.pinned)
    const next = arrayMove(group, group.indexOf(moved), group.indexOf(over))
    const beforeId = next[next.indexOf(moved) + 1]?.id ?? null
    const rest = notes.filter((note) => note.pinned !== moved.pinned)
    // Shown at once; a refused move puts the list back as the server has it.
    setLoaded({ state: "ready", list: { ...list, notes: moved.pinned ? [...next, ...rest] : [...rest, ...next] } })
    void run(() => moveNote(moved.id, beforeId)).then((ok) => (ok ? undefined : reload()))
  }

  let body: React.ReactNode
  if (open) {
    body = (
      <div className="grid gap-3">
        <PageNoteEditor
          key={open.id}
          stored={open.body}
          canWrite={canWrite}
          startFocused={justMade === open.id}
          placeholder="Write a note. Type / for a picture, a checklist and more."
          onSave={(next: NoteNode) => saveNote(open.id, next)}
          onSaved={(stored) => keep(open.id, stored)}
        />
        {/* Right under the note, as in Travel (Tyler, 3 Nov 2026: "add a link here that says Back to notes"). */}
        <div>
          <Button
            type="button"
            variant="link"
            size="sm"
            className="px-1"
            onClick={() => {
              setOpenId(null)
              setJustMade(null)
              reload()
            }}
          >
            <ArrowLeftIcon className="size-4" />
            Back to notes
          </Button>
        </div>
      </div>
    )
  } else if (openId) {
    // A # link to a note that has gone.
    body = (
      <div className="grid gap-2">
        <p className="px-1 py-2 text-sm text-muted-foreground">
          That note isn't here any more. The project's other notes are below.
        </p>
        <div>
          <Button type="button" variant="link" size="sm" className="px-1" onClick={() => setOpenId(null)}>
            <ArrowLeftIcon className="size-4" />
            Back to notes
          </Button>
        </div>
      </div>
    )
  } else if (notes.length === 0 && !canWrite) {
    body = <p className="px-1 py-2 text-sm text-muted-foreground">No notes on this project.</p>
  } else if (notes.length === 0) {
    body = (
      <button
        type="button"
        disabled={busy}
        onClick={() => void create()}
        className="grid min-h-48 w-full content-center justify-items-center gap-2 rounded-lg border border-dashed p-6 text-center text-muted-foreground hover:bg-accent/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
      >
        {busy ? <Loader2Icon className="size-5 animate-spin" aria-hidden /> : <NotebookPenIcon className="size-5" aria-hidden />}
        <span className="text-sm font-medium text-foreground">Add a note</span>
        <span className="max-w-56 text-xs">Keep meeting notes, links and lists for this project.</span>
      </button>
    )
  } else {
    const pinned = notes.filter((note) => note.pinned)
    const rest = notes.filter((note) => !note.pinned)
    const group = (items: ProjectNote[], label: string) =>
      items.length ? (
        <SortableContext items={items.map((note) => note.id)} strategy={verticalListSortingStrategy}>
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-1" aria-label={label}>
            {items.map((note) => (
              <NoteRow
                key={note.id}
                note={note}
                dragDisabled={!canWrite || busy || items.length < 2}
                onOpen={() => setOpenId(note.id)}
                onMenu={canWrite ? (at) => setMenu({ note, at }) : undefined}
              />
            ))}
          </ul>
        </SortableContext>
      ) : null
    body = (
      <div className="grid gap-2">
        <DndContext id={dndId} sensors={sensors} collisionDetection={closestCenter} onDragEnd={drop}>
          {group(pinned, "Pinned notes")}
          {group(rest, pinned.length ? "Other notes" : "Notes")}
        </DndContext>
        {canWrite ? (
          <Button type="button" variant="outline" className="w-full" disabled={busy} onClick={() => void create()}>
            {busy ? <Loader2Icon className="size-4 animate-spin" /> : <PlusIcon className="size-4" />}
            New note
          </Button>
        ) : null}
      </div>
    )
  }

  return (
    <>
      <PanelBody>{body}</PanelBody>
      {menu ? (
        // Not modal, so a right-click on another note moves the menu there in one go.
        <DropdownMenu open onOpenChange={(next) => (next ? undefined : setMenu(null))} modal={false}>
          <DropdownMenuTrigger asChild>
            <PointAnchor x={menu.at.x} y={menu.at.y} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-44" onCloseAutoFocus={(event) => event.preventDefault()}>
            <DropdownMenuItem onSelect={() => void change(() => pinNote(menu.note.id, !menu.note.pinned))}>
              {menu.note.pinned ? <PinOffIcon className="size-4" /> : <PinIcon className="size-4" />}
              {menu.note.pinned ? "Unpin" : "Pin to top"}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void change(() => duplicateNote(menu.note.id))}>
              <CopyIcon className="size-4" />
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => void remove(menu.note)}>
              <Trash2Icon className="size-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </>
  )
}

function PanelBody({ children }: { children: React.ReactNode }) {
  return (
    <ScrollArea className="relative min-h-0 flex-1" viewportClassName="h-full">
      <div className="grid gap-3 p-3">{children}</div>
    </ScrollArea>
  )
}

/** One note in the list: its writer, first line and last change, and a handle to drag it by. */
function NoteRow({
  note,
  dragDisabled,
  onOpen,
  onMenu,
}: {
  note: ProjectNote
  dragDisabled: boolean
  onOpen: () => void
  /** Right-click: opens the note's menu at the mouse. Absent where the notes read only. */
  onMenu?: (at: { x: number; y: number }) => void
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: note.id,
    disabled: dragDisabled,
  })
  const style: React.CSSProperties | undefined = transform
    ? { transform: `translate3d(0, ${transform.y}px, 0)`, transition }
    : undefined
  const writer = note.writer?.name ?? "A deleted account"
  return (
    <li ref={setNodeRef} style={style} className={cn("group/note relative", isDragging && "z-10 rounded-md bg-card shadow-md")}>
      <button
        type="button"
        data-note-id={note.id}
        onClick={onOpen}
        onContextMenu={(event) => {
          event.preventDefault()
          onMenu?.({ x: event.clientX, y: event.clientY })
        }}
        className="flex w-full min-w-0 items-center gap-2 rounded-md py-2 pr-8 pl-2 text-left hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <PersonAvatar name={writer} avatarUrl={note.writer?.avatarUrl} />
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span className="truncate text-sm font-medium">{note.title}</span>
          <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
            <span className="truncate">
              {writer}, {formatDate(note.updatedAt)}
            </span>
          </span>
        </span>
        {note.pinned ? (
          <>
            <PinIcon className="size-3.5 shrink-0 fill-amber-400 text-amber-500" aria-hidden />
            <span className="sr-only">Pinned</span>
          </>
        ) : null}
      </button>
      {dragDisabled ? null : (
        <div className={cn("absolute top-1/2 right-1 -translate-y-1/2", QUIET)}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                ref={setActivatorNodeRef}
                {...listeners}
                {...attributes}
                aria-label={`Drag "${note.title}" to change the order`}
                className={cn(
                  "flex size-6 cursor-grab touch-none items-center justify-center rounded text-muted-foreground hover:text-foreground",
                  focusRingInset
                )}
              >
                <GripVerticalIcon className="size-4" aria-hidden />
              </button>
            </TooltipTrigger>
            <TooltipContent>Drag to change the order</TooltipContent>
          </Tooltip>
        </div>
      )}
    </li>
  )
}
