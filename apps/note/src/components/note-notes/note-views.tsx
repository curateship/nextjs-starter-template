import * as React from "react"
import {
  closestCorners,
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import { CSS } from "@dnd-kit/utilities"
import { ArchiveIcon, ListChecksIcon, PinIcon, SettingsIcon, Trash2Icon } from "lucide-react"

import { FieldValue, OptionBadge } from "@/components/note-notes/field-input"
import { NoteIcon } from "@/components/note-notes/note-icon"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSortButton,
} from "@/components/ui/table"
import { formatShortTimeAgo } from "@/lib/format/format-time"
import { focusRing } from "@/lib/layout/focus-ring"
import { formatFieldNumber, hasValue, type NoteField } from "@/lib/note/notes/fields"
import { noteTitle, type NoteCard } from "@/lib/note/notes/notes"
import { columnTotal, type NoteSort, type TotalKind } from "@/lib/note/notes/views"
import { cn } from "@/lib/utils"

export type ViewSelection = {
  selected: ReadonlySet<string>
  toggle: (id: string) => void
  toggleVisible: (ids: string[]) => void
  selectAllState: (ids: string[]) => boolean | "indeterminate"
}

/** The tick box on a card or row, there to pick notes for a change to many at once. */
function PickBox({ note, selection }: { note: NoteCard; selection: ViewSelection }) {
  return (
    <Checkbox
      aria-label={`Pick ${noteTitle(note.title)}`}
      checked={selection.selected.has(note.id)}
      onCheckedChange={() => selection.toggle(note.id)}
    />
  )
}

/**
 * The list: one card per note, with its icon, title, first line, up to three
 * field values and how much of its checklist is done. Pinned notes come first.
 */
export function NotesList({
  notes,
  fields,
  pickedId,
  showFolder,
  selection,
  onPick,
}: {
  notes: NoteCard[]
  fields: NoteField[]
  pickedId: string | null
  /** The notes come from several folders (All notes, search), so each names its own. */
  showFolder: boolean
  selection: ViewSelection
  onPick: (note: NoteCard) => void
}) {
  const shownFields = fields.slice(0, 3)
  return (
    <ul aria-label="Notes" className="grid gap-2 p-3">
      {notes.map((note) => (
        <li
          key={note.id}
          data-note-id={note.id}
          className={cn(
            "flex gap-3 rounded-lg border bg-card p-3 transition-colors",
            pickedId === note.id ? "border-primary/50 bg-muted/60" : "hover:bg-muted/40"
          )}
        >
          <span className="flex pt-0.5">
            <PickBox note={note} selection={selection} />
          </span>
          <button
            type="button"
            onClick={() => onPick(note)}
            aria-current={pickedId === note.id || undefined}
            className={cn("grid min-w-0 flex-1 gap-1 rounded-sm text-left", focusRing)}
          >
            <span className="flex min-w-0 items-center gap-2">
              <NoteIcon icon={note.icon} className="text-muted-foreground" />
              <span className="min-w-0 truncate text-sm font-medium">{noteTitle(note.title)}</span>
              {note.pinned ? <PinIcon aria-label="Pinned" className="size-3.5 shrink-0 text-muted-foreground" /> : null}
              {note.archived ? (
                <Badge variant="outline" className="shrink-0 font-normal">
                  <ArchiveIcon aria-hidden />
                  Archived
                </Badge>
              ) : null}
              {/* "2m" on the server can be "3m" by the time the browser draws it. */}
              <span suppressHydrationWarning className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">
                {formatShortTimeAgo(note.updatedAt)}
              </span>
            </span>
            {note.firstLine ? <span className="line-clamp-2 text-sm text-muted-foreground">{note.firstLine}</span> : null}
            <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {showFolder ? <span className="truncate">{note.folderName ?? "No folder"}</span> : null}
              {note.checklist.total ? (
                <span className="flex items-center gap-1 tabular-nums">
                  <ListChecksIcon aria-hidden className="size-3.5" />
                  {note.checklist.done} of {note.checklist.total} done
                </span>
              ) : null}
              {shownFields.map((field) =>
                hasValue(note.values[field.key]) ? (
                  <span key={field.key} className="flex min-w-0 items-center gap-1">
                    <span>{field.name}:</span>
                    <FieldValue field={field} value={note.values[field.key]} />
                  </span>
                ) : null
              )}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

/**
 * The table: a column per field plus Title and Edited, a header to click
 * for the sort, and under each number column a total set to Sum, Average or
 * nothing.
 */
export function NotesTable({
  notes,
  fields,
  pickedId,
  sort,
  totals,
  selection,
  onPick,
  onTrash,
  onSort,
  onTotal,
}: {
  notes: NoteCard[]
  fields: NoteField[]
  pickedId: string | null
  sort: NoteSort | null
  totals: Record<string, TotalKind>
  selection: ViewSelection
  onPick: (note: NoteCard) => void
  onTrash: (note: NoteCard) => void
  onSort: (sort: NoteSort | null) => void
  onTotal: (key: string, kind: TotalKind | null) => void
}) {
  const ids = notes.map((note) => note.id)
  const numberFields = fields.filter((field) => field.type === "number")

  function sortBy(key: string) {
    if (sort?.key !== key) onSort({ key, dir: key === "edited" ? "desc" : "asc" })
    else onSort({ key, dir: sort.dir === "asc" ? "desc" : "asc" })
  }
  const head = (key: string, label: string) => (
    <TableSortButton active={sort?.key === key} direction={sort?.dir ?? "asc"} onClick={() => sortBy(key)}>
      {label}
    </TableSortButton>
  )

  return (
    <ScrollArea className="min-h-0 flex-1">
      <Table containerClassName="overflow-visible">
        <TableHeader className="sticky top-0 z-10 bg-muted">
          <TableRow>
            <TableHead column="select">
              <Checkbox
                aria-label="Pick every note showing"
                checked={selection.selectAllState(ids)}
                onCheckedChange={() => selection.toggleVisible(ids)}
              />
            </TableHead>
            <TableHead className="min-w-56">{head("title", "Title")}</TableHead>
            {fields.map((field) => (
              <TableHead key={field.key}>{field.type === "checkbox" ? field.name : head(field.key, field.name)}</TableHead>
            ))}
            <TableHead>{head("edited", "Edited")}</TableHead>
            <TableHead>
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {notes.map((note) => (
            <TableRow
              key={note.id}
              data-note-id={note.id}
              rowAction={() => onPick(note)}
              className={cn(pickedId === note.id && "bg-muted/60")}
            >
              <TableCell column="select">
                <PickBox note={note} selection={selection} />
              </TableCell>
              <TableCell>
                <button
                  type="button"
                  onClick={() => onPick(note)}
                  className={cn("flex max-w-72 min-w-0 items-center gap-2 rounded-sm text-left font-medium", focusRing)}
                >
                  <NoteIcon icon={note.icon} className="text-muted-foreground" />
                  <span className="truncate">{noteTitle(note.title)}</span>
                  {note.pinned ? <PinIcon aria-label="Pinned" className="size-3.5 shrink-0 text-muted-foreground" /> : null}
                </button>
              </TableCell>
              {fields.map((field) => (
                <TableCell key={field.key} className="max-w-60">
                  <FieldValue field={field} value={note.values[field.key]} />
                </TableCell>
              ))}
              <TableCell suppressHydrationWarning className="text-xs text-muted-foreground tabular-nums">
                {formatShortTimeAgo(note.updatedAt)}
              </TableCell>
              <TableCell column="actions">
                <Button type="button" variant="ghost" size="icon-sm" aria-label={`Open ${noteTitle(note.title)}`} onClick={() => onPick(note)}>
                  <SettingsIcon />
                </Button>
                <Button type="button" variant="ghost" size="icon-sm" aria-label={`Move ${noteTitle(note.title)} to Trash`} onClick={() => onTrash(note)}>
                  <Trash2Icon />
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {numberFields.length ? (
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableCell column="select" />
              <TableCell className="text-xs font-medium text-muted-foreground">Totals</TableCell>
              {fields.map((field) => (
                <TableCell key={field.key}>
                  {field.type === "number" ? (
                    <TotalCell field={field} notes={notes} kind={totals[field.key] ?? null} onChange={(kind) => onTotal(field.key, kind)} />
                  ) : null}
                </TableCell>
              ))}
              <TableCell />
              <TableCell column="actions" />
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  )
}

const NO_TOTAL = "__none__"

function TotalCell({
  field,
  notes,
  kind,
  onChange,
}: {
  field: NoteField
  notes: NoteCard[]
  kind: TotalKind | null
  onChange: (kind: TotalKind | null) => void
}) {
  const figure = kind ? columnTotal(notes, field.key, kind) : null
  return (
    <Select value={kind ?? NO_TOTAL} onValueChange={(next) => onChange(next === NO_TOTAL ? null : (next as TotalKind))}>
      <SelectTrigger aria-label={`Total under ${field.name}`} className="w-fit gap-1.5 text-xs">
        <SelectValue>
          {kind ? `${kind === "sum" ? "Sum" : "Average"} ${figure === null ? "none" : formatFieldNumber(figure)}` : "No total"}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_TOTAL}>No total</SelectItem>
        <SelectItem value="sum">Sum</SelectItem>
        <SelectItem value="average">Average</SelectItem>
      </SelectContent>
    </Select>
  )
}

const NO_VALUE = "__none__"

/**
 * The board: a column per option of one choice field, plus No value.
 * Dragging a card to another column sets that option on the note; the card
 * moves at once and goes back if the save is refused.
 */
export function NotesBoard({
  notes,
  field,
  fields,
  pickedId,
  onPick,
  onMove,
}: {
  notes: NoteCard[]
  field: NoteField
  fields: NoteField[]
  pickedId: string | null
  onPick: (note: NoteCard) => void
  /** Sets the note's value in `field`; resolves false when it was refused. */
  onMove: (note: NoteCard, optionId: string | null) => Promise<boolean>
}) {
  // Pointer only. The keyboard sensor takes Enter and Space for a drag, which
  // would leave a keyboard user unable to open a card; from the keyboard the
  // column changes through the field on the open note instead.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))
  // Where a card was dropped, shown until the save answers.
  const [moved, setMoved] = React.useState<Record<string, string | null>>({})
  const columns = [...field.options.map((option) => ({ id: option.id, option })), { id: NO_VALUE, option: null }]
  const others = fields.filter((each) => each.key !== field.key).slice(0, 2)

  function columnOf(note: NoteCard) {
    if (note.id in moved) return moved[note.id] ?? NO_VALUE
    const value = note.values[field.key]
    return typeof value === "string" && field.options.some((option) => option.id === value) ? value : NO_VALUE
  }

  async function onDragEnd(event: DragEndEvent) {
    if (!event.over) return
    const note = notes.find((each) => each.id === event.active.id)
    const to = String(event.over.id)
    if (!note || columnOf(note) === to) return
    const optionId = to === NO_VALUE ? null : to
    setMoved((current) => ({ ...current, [note.id]: optionId }))
    await onMove(note, optionId)
    // Saved or refused, the card's own value now says where it belongs.
    setMoved(({ [note.id]: _done, ...rest }) => rest)
  }

  return (
    <ScrollArea className="min-h-0 flex-1">
      <DndContext id={`note-board-${field.key}`} sensors={sensors} collisionDetection={closestCorners} onDragEnd={(event) => void onDragEnd(event)}>
        <div className="flex min-h-full gap-3 p-3">
          {columns.map((column) => {
            const inColumn = notes.filter((note) => columnOf(note) === column.id)
            return (
              <BoardColumn
                key={column.id}
                id={column.id}
                label={column.option ? <OptionBadge label={column.option.label} colour={column.option.colour} /> : <span className="text-sm text-muted-foreground">No value</span>}
                name={column.option?.label ?? "No value"}
                count={inColumn.length}
              >
                {inColumn.map((note) => (
                  <BoardCard
                    key={note.id}
                    note={note}
                    fields={others}
                    picked={pickedId === note.id}
                    onPick={() => onPick(note)}
                  />
                ))}
              </BoardColumn>
            )
          })}
        </div>
      </DndContext>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  )
}

function BoardColumn({
  id,
  label,
  name,
  count,
  children,
}: {
  id: string
  label: React.ReactNode
  name: string
  count: number
  children: React.ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <section
      ref={setNodeRef}
      aria-label={name}
      className={cn("flex w-64 shrink-0 flex-col gap-2 rounded-lg border bg-muted/40 p-2", isOver && "bg-muted")}
    >
      <h3 className="flex items-center gap-2 px-1">
        {label}
        <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
      </h3>
      <ul className="grid gap-2">{children}</ul>
    </section>
  )
}

function BoardCard({
  note,
  fields,
  picked,
  onPick,
}: {
  note: NoteCard
  fields: NoteField[]
  picked: boolean
  onPick: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: note.id })
  return (
    <li
      ref={setNodeRef}
      data-note-id={note.id}
      style={{ transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.6 : 1 }}
      className={cn("rounded-md border bg-card shadow-xs", picked && "border-primary/50", isDragging && "relative z-10")}
    >
      <button
        type="button"
        onClick={onPick}
        {...attributes}
        {...listeners}
        aria-roledescription="Note card"
        className={cn("grid w-full min-w-0 cursor-grab gap-1.5 rounded-md p-2.5 text-left active:cursor-grabbing", focusRing)}
      >
        <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
          <NoteIcon icon={note.icon} className="text-muted-foreground" />
          <span className="truncate">{noteTitle(note.title)}</span>
          {note.pinned ? <PinIcon aria-label="Pinned" className="size-3.5 shrink-0 text-muted-foreground" /> : null}
        </span>
        {fields.map((field) =>
          hasValue(note.values[field.key]) ? (
            <span key={field.key} className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
              <span>{field.name}:</span>
              <FieldValue field={field} value={note.values[field.key]} />
            </span>
          ) : null
        )}
        {note.checklist.total ? (
          <span className="flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
            <ListChecksIcon aria-hidden className="size-3.5" />
            {note.checklist.done} of {note.checklist.total} done
          </span>
        ) : null}
      </button>
    </li>
  )
}
