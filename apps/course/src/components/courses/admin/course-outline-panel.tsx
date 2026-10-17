import * as React from "react"
import { closestCenter, DndContext, type DragEndEvent } from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import {
  FolderIcon,
  GripVerticalIcon,
  ListIcon,
  Loader2Icon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react"

import {
  DRAG_HANDLE_CLASS,
  useNavSensors,
  useSortableRow,
} from "@/components/settings/nav-editor-shared"
import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { CourseOutlineOrder } from "@/lib/courses/course-outline"
import type { AdminChapter, AdminGroup } from "@/lib/courses/course-types"
import { formatDate } from "@/lib/format/format-time"
import { focusRing } from "@/lib/layout/focus-ring"
import { cn } from "@/lib/utils"

/**
 * The course editor's left panel: the course in reading order. Chapters
 * above every part come first, then each part with its chapters. Everything
 * drags: a chapter into a new place or a new part, a part with all of its
 * chapters.
 *
 * The list is one flat run of rows, parts and chapters together, and which
 * part a chapter is in is simply the last part row above it. That is what
 * lets a chapter be dragged from one part into another with one list.
 */

type Row = { key: string; kind: "group"; group: AdminGroup } | { key: string; kind: "chapter"; chapter: AdminChapter }

function rowsFor(groups: AdminGroup[], chapters: AdminChapter[]): Row[] {
  const loose = chapters.filter((chapter) => !chapter.groupId)
  const rows: Row[] = loose.map((chapter) => ({ key: `c:${chapter.id}`, kind: "chapter", chapter }))
  for (const group of [...groups].sort((a, b) => a.position - b.position)) {
    rows.push({ key: `g:${group.id}`, kind: "group", group })
    for (const chapter of chapters.filter((one) => one.groupId === group.id)) {
      rows.push({ key: `c:${chapter.id}`, kind: "chapter", chapter })
    }
  }
  return rows
}

/** Which part each chapter is in, read straight off the order of the rows. */
function orderFromRows(rows: Row[]): CourseOutlineOrder {
  const order: CourseOutlineOrder = { loose: [], groups: [] }
  for (const row of rows) {
    if (row.kind === "group") {
      order.groups.push({ id: row.group.id, chapterIds: [] })
      continue
    }
    const current = order.groups.at(-1)
    if (current) current.chapterIds.push(row.chapter.id)
    else order.loose.push(row.chapter.id)
  }
  return order
}

/** A part's own run of rows: its header and every chapter under it. */
function blockEnd(rows: Row[], start: number) {
  let end = start + 1
  while (end < rows.length && rows[end].kind === "chapter") end += 1
  return end
}

function moveRows(rows: Row[], fromKey: string, toKey: string): Row[] {
  const from = rows.findIndex((row) => row.key === fromKey)
  const to = rows.findIndex((row) => row.key === toKey)
  if (from === -1 || to === -1) return rows
  if (rows[from].kind === "chapter") return arrayMove(rows, from, to)

  // A part moves with its chapters, and only ever lands between two parts,
  // because the chapters above every part always come first.
  const block = rows.slice(from, blockEnd(rows, from))
  const rest = [...rows.slice(0, from), ...rows.slice(from + block.length)]
  let target = rest.findIndex((row) => row.key === toKey)
  // Dropped on a chapter means the part that chapter is in. A chapter above
  // every part has none, which walks off the top.
  while (target >= 0 && rest[target].kind === "chapter") target -= 1
  if (target < 0) {
    const firstGroup = rest.findIndex((row) => row.kind === "group")
    return firstGroup === -1
      ? [...rest, ...block]
      : [...rest.slice(0, firstGroup), ...block, ...rest.slice(firstGroup)]
  }
  const insertAt = to > from ? blockEnd(rest, target) : target
  return [...rest.slice(0, insertAt), ...block, ...rest.slice(insertAt)]
}

export function CourseOutlinePanel({
  groups,
  chapters,
  selectedId,
  busy,
  onSelect,
  onReorder,
  onAddChapter,
  onAddGroup,
  onRenameGroup,
  onDeleteGroup,
}: {
  groups: AdminGroup[]
  chapters: AdminChapter[]
  selectedId: string | null
  busy: boolean
  onSelect: (id: string) => void
  onReorder: (order: CourseOutlineOrder, preview: { groups: AdminGroup[]; chapters: AdminChapter[] }) => void
  onAddChapter: (groupId: string | null) => void
  onAddGroup: () => void
  onRenameGroup: (group: AdminGroup, title: string) => void
  onDeleteGroup: (group: AdminGroup) => void
}) {
  const sensors = useNavSensors()
  const rows = rowsFor(groups, chapters)

  const handleDragEnd = (event: DragEndEvent) => {
    if (!event.over || event.active.id === event.over.id) return
    const next = moveRows(rows, String(event.active.id), String(event.over.id))
    const order = orderFromRows(next)
    // Drawn in the new order at once, because a drag that snaps back while a
    // request flies reads as a drag that failed.
    const groupPosition = new Map(order.groups.map((group, index) => [group.id, index]))
    const chapterPlace = new Map<string, { groupId: string | null; position: number }>()
    order.loose.forEach((id, position) => chapterPlace.set(id, { groupId: null, position }))
    for (const group of order.groups) {
      group.chapterIds.forEach((id, position) => chapterPlace.set(id, { groupId: group.id, position }))
    }
    onReorder(order, {
      groups: groups.map((group) => ({ ...group, position: groupPosition.get(group.id) ?? group.position })),
      chapters: next.flatMap((row) =>
        row.kind === "chapter" ? [{ ...row.chapter, ...chapterPlace.get(row.chapter.id) }] : []
      ),
    })
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-card">
      <DashboardCardTitleHeader
        icon={<ListIcon className="size-4" />}
        title="Chapters"
        meta={`${chapters.length} in this course`}
        action={busy ? <Loader2Icon className="size-4 animate-spin text-muted-foreground" /> : null}
      />
      <ScrollArea className="min-h-0 flex-1">
        <div className="grid gap-1 p-2">
          {/* A fixed id, because dnd-kit otherwise numbers its screen-reader
              hints with a counter that differs between the server's render
              and the browser's, which React reports as a mismatch. */}
          <DndContext
            id="course-outline"
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={rows.map((row) => row.key)} strategy={verticalListSortingStrategy}>
              {rows.map((row) =>
                row.kind === "group" ? (
                  <GroupRow
                    key={row.key}
                    rowKey={row.key}
                    group={row.group}
                    onAddChapter={() => onAddChapter(row.group.id)}
                    onRename={(title) => onRenameGroup(row.group, title)}
                    onDelete={() => onDeleteGroup(row.group)}
                  />
                ) : (
                  <ChapterRow
                    key={row.key}
                    rowKey={row.key}
                    chapter={row.chapter}
                    selected={row.chapter.id === selectedId}
                    onSelect={() => onSelect(row.chapter.id)}
                  />
                )
              )}
            </SortableContext>
          </DndContext>
        </div>
      </ScrollArea>
      <div className="flex flex-wrap gap-2 border-t p-3">
        <Button type="button" size="sm" onClick={() => onAddChapter(null)} disabled={busy}>
          <PlusIcon className="size-4" />
          Add chapter
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onAddGroup} disabled={busy}>
          <FolderIcon className="size-4" />
          Add part
        </Button>
      </div>
    </div>
  )
}

function ChapterRow({
  rowKey,
  chapter,
  selected,
  onSelect,
}: {
  rowKey: string
  chapter: AdminChapter
  selected: boolean
  onSelect: () => void
}) {
  const { attributes, listeners, setNodeRef, style } = useSortableRow(rowKey, true)
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-1 rounded-md",
        chapter.groupId && "pl-4",
        selected ? "bg-muted" : "hover:bg-muted/60"
      )}
    >
      <button
        type="button"
        className={cn(DRAG_HANDLE_CLASS, "h-8 w-6 shrink-0")}
        aria-label={`Drag ${chapter.title}`}
        {...attributes}
        {...listeners}
      >
        <GripVerticalIcon className="size-4" />
      </button>
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? "true" : undefined}
        className={cn("grid min-w-0 flex-1 gap-0.5 rounded-sm py-1.5 pr-2 text-left", focusRing)}
      >
        <span className={cn("truncate text-sm", selected && "font-medium")}>{chapter.title}</span>
        <span className="flex flex-wrap gap-1">
          {chapter.status === "draft" ? <Badge variant="outline">Draft</Badge> : null}
          {chapter.isPreview ? <Badge variant="secondary">Free preview</Badge> : null}
          {chapter.opensAfterDays ? (
            <Badge variant="outline">Opens day {chapter.opensAfterDays}</Badge>
          ) : null}
          {chapter.publishAt ? (
            <Badge variant="outline">Live {formatDate(chapter.publishAt)}</Badge>
          ) : null}
        </span>
      </button>
    </div>
  )
}

function GroupRow({
  rowKey,
  group,
  onAddChapter,
  onRename,
  onDelete,
}: {
  rowKey: string
  group: AdminGroup
  onAddChapter: () => void
  onRename: (title: string) => void
  onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, style } = useSortableRow(rowKey, true)
  const [title, setTitle] = React.useState(group.title)
  const [lastSaved, setLastSaved] = React.useState(group.title)
  // A rename that came back from the server replaces what is in the box.
  if (group.title !== lastSaved) {
    setLastSaved(group.title)
    setTitle(group.title)
  }

  const commit = () => {
    const next = title.trim()
    if (!next) {
      setTitle(group.title)
      return
    }
    if (next !== group.title) onRename(next)
  }

  return (
    <div ref={setNodeRef} style={style} className="mt-2 flex items-center gap-1 rounded-md bg-muted/50 pr-1">
      <button
        type="button"
        className={cn(DRAG_HANDLE_CLASS, "h-8 w-6 shrink-0")}
        aria-label={`Drag the part ${group.title} with its chapters`}
        {...attributes}
        {...listeners}
      >
        <GripVerticalIcon className="size-4" />
      </button>
      <Input
        value={title}
        maxLength={200}
        aria-label="Part name"
        className="border-transparent bg-transparent px-1 text-xs font-semibold tracking-wide uppercase shadow-none"
        onChange={(event) => setTitle(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") (event.target as HTMLInputElement).blur()
        }}
      />
      <Tooltip>
        <TooltipTrigger asChild>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Add a chapter to ${group.title}`} onClick={onAddChapter}>
            <PlusIcon className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Add a chapter to this part</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove the part ${group.title}`} onClick={onDelete}>
            <Trash2Icon className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Remove the part. Its chapters stay.</TooltipContent>
      </Tooltip>
    </div>
  )
}
