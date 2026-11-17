import * as React from "react"
import { createPortal } from "react-dom"
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CopyIcon,
  Loader2Icon,
  NotebookPenIcon,
  PinIcon,
  PinOffIcon,
  PlusIcon,
  ListChecksIcon,
  Trash2Icon,
} from "lucide-react"

import { CrmGroupRow, CrmTable, CrmTableRow, MainCell, useFolds } from "@/components/crm/crm-table"
import { SideRecord, SideRecordAction, SideRecordMenu } from "@/components/project/side-record"
import { PageNoteEditor } from "@/components/project/project-page-notes"
import { TaskSearchBox, TaskSelectButton } from "@/components/project/task-header-controls"
import { PersonAvatar } from "@/components/project/task-bits"
import { DashboardCardHeader } from "@/components/shared/dashboard-card-header"
import type { TableHeaderColumn } from "@/components/shared/sortable-table-header"
import { SelectedMenu, SelectedMenuRow } from "@/components/shared/mass-select"
import { MiddleHeading, PanelReopenButton } from "@/components/shared/three-panels"
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
import { TableCell, type TableSortDirection } from "@/components/ui/table"
import { duplicateNote, pinNote, saveNote, type ProjectNote } from "@/lib/api/project/project-notes"
import { formatDate } from "@/lib/format/format-time"
import type { NoteNode } from "@/lib/project/note-blocks"
import { TASK_HEADER_BUTTONS } from "@/lib/project/task-header-look"
import { useSelection } from "@/lib/hooks/use-selection"
import type { ProjectNotesState } from "@/lib/project/use-project-notes"
import { cn } from "@/lib/utils"

/** A point on the page for a menu to open from, in the page's body so no scroller shifts it off the mouse. */
export const PointAnchor = React.forwardRef<HTMLSpanElement, { x: number; y: number }>(function PointAnchor(
  { x, y, ...props },
  ref
) {
  return createPortal(
    <span ref={ref} aria-hidden {...props} className="pointer-events-none fixed size-0" style={{ left: x, top: y }} />,
    document.body
  )
})

/**
 * A project's notes, the Notes dashboard on its page (Tyler, 16 Nov 2026:
 * "remove the notes and milestone block and instead create a dashboards for
 * it"): the list in the middle and the open note on the right, as a task
 * opens beside the task list. The notes were a block on the project's page
 * from 15 Nov 2026, and behind a note icon in the panel's header before that
 * (task "Project notes", Tyler, 6 Nov 2026: "Add a note feature here ... like
 * in travel app").
 *
 * They're listed pinned first, then in the order the project's people dragged
 * them into. Right-click a note, or use the ⋮ over the open one, to pin it,
 * duplicate it or delete it; Delete puts it in the project's bin and doesn't
 * ask. Everyone who can see the project sees and writes all its notes; there
 * are no private notes (Tyler, 6 Nov 2026: "remove the privacy feature").
 *
 * The page loads the list once (`useProjectNotes`) and both panels share it,
 * so the Dashboards block can count them too.
 */
/** Pin, Duplicate, Move up and Move down, and Delete, in a row's right-click menu and the open note's ⋮. */
function NoteMenuItems({ state, note, onDeleted }: { state: ProjectNotesState; note: ProjectNote; onDeleted: () => void }) {
  const up = state.moveOf(note, -1)
  const down = state.moveOf(note, 1)
  return (
    <>
      <DropdownMenuItem onSelect={() => void state.change(() => pinNote(note.id, !note.pinned))}>
        {note.pinned ? <PinOffIcon className="size-4" /> : <PinIcon className="size-4" />}
        {note.pinned ? "Unpin" : "Pin to top"}
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => void state.change(() => duplicateNote(note.id))}>
        <CopyIcon className="size-4" />
        Duplicate
      </DropdownMenuItem>
      {up ? (
        <DropdownMenuItem onSelect={up}>
          <ArrowUpIcon className="size-4" />
          Move up
        </DropdownMenuItem>
      ) : null}
      {down ? (
        <DropdownMenuItem onSelect={down}>
          <ArrowDownIcon className="size-4" />
          Move down
        </DropdownMenuItem>
      ) : null}
      <DropdownMenuSeparator />
      <DropdownMenuItem
        variant="destructive"
        onSelect={() => void state.remove(note).then((gone) => (gone ? onDeleted() : undefined))}
      >
        <Trash2Icon className="size-4" />
        Delete
      </DropdownMenuItem>
    </>
  )
}

type NoteSort = "order" | "title" | "writer" | "updated"

const NOTE_COLUMNS: TableHeaderColumn<NoteSort>[] = [
  { key: "title", label: "Note", column: "main", className: "min-w-40" },
  { key: "writer", label: "Written by", column: "preview", className: "hidden md:hidden @xl:table-cell" },
  { key: "updated", label: "Changed", column: "meta" },
]

function compareNotes(sort: NoteSort, a: ProjectNote, b: ProjectNote) {
  if (sort === "title") return a.title.localeCompare(b.title)
  if (sort === "writer") return (a.writer?.name ?? "").localeCompare(b.writer?.name ?? "")
  if (sort === "updated") return a.updatedAt.localeCompare(b.updatedAt)
  return 0
}

/**
 * The Notes dashboard's middle: the section's icon and name, a search box
 * that is always there, and New note, then the notes as a table, the shell's
 * `CrmTable` as the CRM's and Admin's lists are (Tyler, 16 Nov 2026: "add
 * proper table to both notes and milestones"). Each row is the writer's face,
 * the note's first line and a pin when pinned, who wrote it and when it last
 * changed, and a bin. Pinned notes sit under their own heading above the
 * rest. The order everyone shares shows until a column heading sorts them.
 */
export function ProjectNotesMiddle({
  state,
  openId,
  onOpen,
  onDeleted,
}: {
  state: ProjectNotesState
  /** The note on the right. */
  openId: string | undefined
  onOpen: (noteId: string) => void
  /** A deleted note: the right panel moves to another. */
  onDeleted: (noteId: string) => void
}) {
  const [query, setQuery] = React.useState("")
  const [sort, setSort] = React.useState<NoteSort>("order")
  const [direction, setDirection] = React.useState<TableSortDirection>("asc")
  const folds = useFolds()
  const [menu, setMenu] = React.useState<{ note: ProjectNote; at: { x: number; y: number } } | null>(null)
  const [massSelect, setMassSelect] = React.useState(false)
  const selection = useSelection()
  const ready = state.loaded.state === "ready" ? state.loaded.list : null
  const canWrite = ready?.canWrite ?? false

  async function create() {
    const id = await state.create()
    if (id) onOpen(id)
  }

  /** A heading sorts by it, then the other way, then goes back to the shared order. */
  function toggleSort(column: NoteSort) {
    if (sort !== column) {
      setSort(column)
      setDirection(column === "updated" ? "desc" : "asc")
    } else if (direction === (column === "updated" ? "desc" : "asc")) {
      setDirection(direction === "asc" ? "desc" : "asc")
    } else {
      setSort("order")
    }
  }

  const words = query.trim().toLowerCase()
  const shown = !ready ? [] : words ? ready.notes.filter((note) => note.title.toLowerCase().includes(words)) : ready.notes
  const shownIds = shown.map((note) => note.id)
  // Ticks on notes the search has hidden stay out of a delete.
  const tickedNotes = shown.filter((note) => selection.selected.has(note.id))

  const header = (
    <DashboardCardHeader className="@container">
      <MiddleHeading icon={NotebookPenIcon} label="Notes" />
      <div className={cn("ml-auto", TASK_HEADER_BUTTONS)}>
        {tickedNotes.length ? (
          <SelectedMenu
            count={tickedNotes.length}
            busy={state.busy}
            onClear={selection.clear}
            pages={{}}
            main={(controls) => (
              <SelectedMenuRow
                className="text-destructive"
                onClick={() => {
                  controls.close()
                  // To the Bin without asking, as one note's Delete does.
                  void state.removeMany(tickedNotes).then((gone) => {
                    selection.clear()
                    if (openId && gone.includes(openId)) onDeleted(openId)
                  })
                }}
              >
                <Trash2Icon className="size-4" />
                Delete
              </SelectedMenuRow>
            )}
          />
        ) : null}
        <TaskSearchBox value={query} onChange={setQuery} what="notes" />
        {canWrite ? (
          <TaskSelectButton
            on={massSelect}
            onToggle={() => {
              if (massSelect) selection.clear()
              setMassSelect(!massSelect)
            }}
          />
        ) : null}
        {canWrite ? (
          <Button type="button" aria-label="New note" disabled={state.busy} onClick={() => void create()} className="@max-2xl:size-8 @max-2xl:px-0">
            {state.busy ? <Loader2Icon className="size-4 animate-spin" /> : <PlusIcon className="size-4" />}
            <span className="@max-2xl:hidden">New note</span>
          </Button>
        ) : null}
      </div>
      <PanelReopenButton side="right" label="Show the note" />
    </DashboardCardHeader>
  )

  if (!ready) {
    return (
      <>
        {header}
        <div className="grid p-3">
          {state.loaded.state === "error" ? (
            <ErrorRow message={state.loaded.message} onRetry={state.reload} />
          ) : (
            <LoadingRow label="Loading the notes…" />
          )}
        </div>
      </>
    )
  }

  const sorted = (items: ProjectNote[]) => {
    if (sort === "order") return items
    const sign = direction === "asc" ? 1 : -1
    return [...items].sort((a, b) => sign * compareNotes(sort, a, b))
  }
  const pinned = sorted(shown.filter((note) => note.pinned))
  const rest = sorted(shown.filter((note) => !note.pinned))
  const row = (note: ProjectNote) => {
    const writer = note.writer?.name ?? "A deleted account"
    return (
      <CrmTableRow
        key={note.id}
        open={note.id === openId}
        label={note.title}
        onOpen={() => onOpen(note.id)}
        tick={{ shown: massSelect, ticked: selection.selected.has(note.id), onToggle: () => selection.toggle(note.id) }}
        onDelete={canWrite ? () => void state.remove(note).then((gone) => (gone ? onDeleted(note.id) : undefined)) : undefined}
        onRightClick={canWrite ? (x, y) => setMenu({ note, at: { x, y } }) : undefined}
      >
        <MainCell name={note.title} lead={<PersonAvatar name={writer} avatarUrl={note.writer?.avatarUrl} />}>
          {note.pinned ? (
            <>
              <PinIcon className="size-3.5 shrink-0 fill-amber-400 text-amber-500" aria-hidden />
              <span className="sr-only">Pinned</span>
            </>
          ) : null}
        </MainCell>
        <TableCell column="preview" className="hidden md:hidden @xl:table-cell">
          <span className="block max-w-48 truncate text-muted-foreground">{writer}</span>
        </TableCell>
        <TableCell column="mutedMeta">{formatDate(note.updatedAt)}</TableCell>
      </CrmTableRow>
    )
  }
  const group = (key: string, label: string, items: ProjectNote[]) =>
    items.length ? (
      <React.Fragment key={key}>
        <CrmGroupRow label={label} count={items.length} folded={folds.folded(key)} onToggle={() => folds.toggle(key)} />
        {folds.folded(key) ? null : items.map(row)}
      </React.Fragment>
    ) : null

  return (
    // Its own container, so columns drop out as the middle narrows, as the CRM's tables do.
    <div className="@container flex h-full min-h-0 flex-col">
      {header}
      <CrmTable<NoteSort>
        columns={NOTE_COLUMNS}
        sort={sort}
        direction={direction}
        onSort={toggleSort}
        select={
          massSelect
            ? {
                noun: "notes",
                checked: selection.selectAllState(shownIds),
                disabled: shownIds.length === 0,
                onToggle: () => selection.toggleVisible(shownIds),
              }
            : null
        }
        empty={
          shown.length > 0 ? null : words ? (
            <span className="grid justify-items-center gap-2">
              {`No note matches "${query.trim()}".`}
              <Button type="button" variant="outline" size="sm" onClick={() => setQuery("")}>
                Clear search
              </Button>
            </span>
          ) : (
            "No notes on this project yet."
          )
        }
      >
        {/* Headings only once something is pinned; otherwise the notes are one list. */}
        {pinned.length ? [group("pinned", "Pinned", pinned), group("rest", "Notes", rest)] : rest.map(row)}
      </CrmTable>
      {menu ? (
        // Not modal, so a right-click on another note moves the menu there in one go.
        <DropdownMenu open onOpenChange={(next) => (next ? undefined : setMenu(null))} modal={false}>
          <DropdownMenuTrigger asChild>
            <PointAnchor x={menu.at.x} y={menu.at.y} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-44" onCloseAutoFocus={(event) => event.preventDefault()}>
            {/* Mass select at the top, as the task List's right-click has it; turning it on ticks this note. */}
            <DropdownMenuItem
              onSelect={() => {
                if (massSelect) selection.clear()
                else if (!selection.selected.has(menu.note.id)) selection.toggle(menu.note.id)
                setMassSelect(!massSelect)
              }}
            >
              <ListChecksIcon className="size-4" />
              {massSelect ? "Hide select" : "Mass select"}
            </DropdownMenuItem>
            <NoteMenuItems state={state} note={menu.note} onDeleted={() => onDeleted(menu.note.id)} />
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  )
}

/**
 * The Notes dashboard's right panel, drawn as the open task's is
 * (`SideRecord`; Tyler, 16 Nov 2026: "still not following ui standards"): the
 * note's first line in the header, then its ⋮, the task menu's own look, with
 * Pin to top, Duplicate, Move up and Move down, then Delete in red under a
 * line, which goes to the Bin and doesn't ask. The body is the note, written
 * in place and saving itself, and the footer says who wrote it and when it
 * last changed. It is never empty: with no note in the address it shows the
 * first, and a project with none says how to write one.
 */
export function ProjectNoteSide({
  state,
  note,
  onDeleted,
}: {
  state: ProjectNotesState
  note: ProjectNote | undefined
  onDeleted: (noteId: string) => void
}) {
  const ready = state.loaded.state === "ready" ? state.loaded.list : null
  const canWrite = ready?.canWrite ?? false
  if (!note) {
    return (
      <SideRecord icon={<NotebookPenIcon className="size-4" />} title="Note" hideLabel="Hide the note">
        {/* Nothing while the notes load, never a loading circle in a panel. */}
        {ready ? (
          <p className="text-sm text-muted-foreground">
            {canWrite ? "No notes on this project yet. Press New note to write the first." : "No notes on this project."}
          </p>
        ) : null}
      </SideRecord>
    )
  }
  return (
    <SideRecord
      key={note.id}
      icon={<NotebookPenIcon className="size-4" />}
      title={note.title}
      menu={canWrite ? <NoteMenu state={state} note={note} onDeleted={() => onDeleted(note.id)} /> : null}
      hideLabel="Hide the note"
      footer={
        <span className="text-sm text-muted-foreground">
          {note.writer?.name ?? "A deleted account"}, {formatDate(note.updatedAt)}
        </span>
      }
    >
      <PageNoteEditor
        stored={note.body}
        canWrite={canWrite}
        startFocused={state.justMade === note.id}
        placeholder="Write a note. Type / for a picture, a checklist and more."
        onSave={(next: NoteNode) => saveNote(note.id, next)}
        onSaved={(stored) => state.keep(note.id, stored)}
      />
    </SideRecord>
  )
}

/** The open note's ⋮: its actions as the task menu's rows, Delete last in red. */
function NoteMenu({ state, note, onDeleted }: { state: ProjectNotesState; note: ProjectNote; onDeleted: () => void }) {
  const [open, setOpen] = React.useState(false)
  const up = state.moveOf(note, -1)
  const down = state.moveOf(note, 1)
  const act = (work: () => void) => () => {
    setOpen(false)
    work()
  }
  return (
    <SideRecordMenu
      label="Note menu"
      open={open}
      onOpenChange={setOpen}
      actions={
        <>
          <SideRecordAction
            icon={note.pinned ? <PinOffIcon className="size-4" /> : <PinIcon className="size-4" />}
            onSelect={act(() => void state.change(() => pinNote(note.id, !note.pinned)))}
          >
            {note.pinned ? "Unpin" : "Pin to top"}
          </SideRecordAction>
          <SideRecordAction icon={<CopyIcon className="size-4" />} onSelect={act(() => void state.change(() => duplicateNote(note.id)))}>
            Duplicate
          </SideRecordAction>
          {up ? (
            <SideRecordAction icon={<ArrowUpIcon className="size-4" />} onSelect={act(up)}>
              Move up
            </SideRecordAction>
          ) : null}
          {down ? (
            <SideRecordAction icon={<ArrowDownIcon className="size-4" />} onSelect={act(down)}>
              Move down
            </SideRecordAction>
          ) : null}
        </>
      }
      remove={{
        label: "Delete note",
        icon: <Trash2Icon className="size-4" />,
        onSelect: act(() => void state.remove(note).then((gone) => (gone ? onDeleted() : undefined))),
      }}
    />
  )
}
