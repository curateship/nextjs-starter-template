import * as React from "react"
import {
  closestCenter,
  DndContext,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { CheckIcon, ChevronDownIcon, CircleCheckIcon, CircleIcon, GripVerticalIcon, PlusIcon } from "lucide-react"

import type { BoardActions } from "@/components/travel/board-actions"
import { CardMenu } from "@/components/travel/board-card"
import { dayLabel } from "@/components/travel/new-activity"
import { typeOf, useTrip } from "@/components/travel/trip-context"
import { ActivityTypeIcon } from "@/components/travel/type-icon"
import { useSaveActivity } from "@/components/travel/use-save-activity"
import {
  SelectAllTableHead,
  SortableTableHeader,
  type SortableColumn,
} from "@/components/shared/sortable-table-header"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Table, TableBody, TableCell, TableGroupRow, TableRow } from "@/components/ui/table"
import type { Activity } from "@/lib/api/travel/trips"
import { useTableSort } from "@/lib/hooks/use-table-sort"
import { boardColumns, columnKey, formatWhen } from "@/lib/travel/board"
import { listFoldsKey } from "@/lib/travel/panel-keys"
import { formatMoney } from "@/lib/travel/rules"
import { cn } from "@/lib/utils"

/** "order" is the day's own order, the board's; the rest are columns. */
type Column = "order" | "title" | "type" | "cost"

const COLUMNS: SortableColumn<Column>[] = [
  { key: "title", label: "Activity", column: "main", className: "min-w-24" },
  { key: "order", label: "Time", column: "preview" },
  { key: "type", label: "Type", column: "preview" },
  { key: "cost", label: "Cost", column: "preview" },
]

const HEADING_DROP = "heading:"
const NO_TYPE = "none"

type Group = { key: string; day: number | null; label: string; rows: Activity[] }

/**
 * The List tab (task part 18): every activity as a row, grouped under its
 * day, Ideas last. Since 6 Nov 2026 it is drawn as Project's list is (Tyler:
 * "The list view should match that of the list view of the project app. Add
 * what make sense and ignore what doesnt"; `apps/project/src/components/project/task-list.tsx`):
 *
 * - a day's heading folds its rows, pressed anywhere or with the arrow that
 *   shows on pointing, remembered per trip in this browser; its "+" opens New
 *   activity set to that day;
 * - rows sit tighter, each with a Done circle before the name, a Type that
 *   changes from its cell, and Delete at the end (a press on the row opens
 *   it, so Project's open cog is left out: it pushed Delete past the panel's
 *   edge at 1440 wide);
 * - Activity, Type and Cost sort within each day; Time is the day's own order;
 * - Mass select, from the ⋮ or a row's right-click, shows tick boxes and, in
 *   the day's order, drag handles: a row dropped under another day moves there;
 * - a row's right-click is the board card's menu.
 *
 * Project's status, priority, person and due columns have no trip
 * counterpart, so they are left out. The count after a day's name stays out
 * (Tyler, 3 Nov 2026: "What is the 3 for?" ... "remove it").
 */
export function TripListView({
  activities,
  newActivity,
  actions,
  selecting,
  selected,
  onToggleSelected,
  onSelectMany,
  onMassSelect,
}: {
  activities: Activity[]
  /** The New activity dropdown, opened from a heading's "+" already set to its day. */
  newActivity: (key: string, day: number | null, trigger: React.ReactNode) => React.ReactNode
  actions: BoardActions
  selecting: boolean
  selected: ReadonlySet<string>
  onToggleSelected: (id: string) => void
  /** Ticks every id given, or clears them when every one is already ticked. */
  onSelectMany: (ids: string[]) => void
  /** Mass select on or off from a row's right-click, that row ticked as it comes on. */
  onMassSelect?: (tickId?: string) => void
}) {
  const { page, typesById, openActivity, openActivityId, readOnly } = useTrip()
  const { trip } = page
  const { sort, direction, toggleSort } = useTableSort<Column>("order")
  const folds = useListFolds(listFoldsKey(trip.id))
  const [menu, setMenu] = React.useState<{ id: string; at: { x: number; y: number } } | null>(null)
  const [held, setHeld] = React.useState<Activity | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))
  const dndId = React.useId()
  const canSelect = selecting && !readOnly
  const canDrag = canSelect && sort === "order" && direction === "asc" && !actions.busy

  const groups = React.useMemo<Group[]>(() => {
    const columns = boardColumns(trip.days, activities)
    const sign = direction === "asc" ? 1 : -1
    const sorted = (rows: Activity[]) =>
      sort === "order"
        ? direction === "asc"
          ? rows
          : [...rows].reverse()
        : [...rows].sort((a, b) => {
            if (sort === "title") return a.title.localeCompare(b.title) * sign
            if (sort === "type") {
              const name = (activity: Activity) => typeOf(activity, typesById)?.name ?? ""
              return name(a).localeCompare(name(b)) * sign || a.title.localeCompare(b.title)
            }
            return ((a.costCents ?? -1) - (b.costCents ?? -1)) * sign || a.title.localeCompare(b.title)
          })
    const days = Array.from({ length: trip.days }, (_, index) => index + 1).map((day) => ({
      key: columnKey(day),
      day,
      label: dayLabel(day, trip.startDate),
      rows: sorted(columns.get(columnKey(day)) ?? []),
    }))
    return [...days, { key: columnKey(null), day: null, label: "Ideas", rows: sorted(columns.get(columnKey(null)) ?? []) }]
  }, [activities, direction, sort, trip.days, trip.startDate, typesById])

  const byId = React.useMemo(() => new Map(activities.map((activity) => [activity.id, activity])), [activities])
  // Select all ticks only the rows in view, never those under a folded day.
  const shownIds = groups.flatMap((group) => (folds.folded(group.key) ? [] : group.rows.map((row) => row.id)))
  const allTicked = shownIds.length > 0 && shownIds.every((id) => selected.has(id))
  const someTicked = shownIds.some((id) => selected.has(id))
  // No actions column: a row's right-click menu holds Delete, as the Trips table's does (Travel polish part 16).
  const colSpan = COLUMNS.length + (canSelect ? 1 : 0)
  const menuActivity = menu ? byId.get(menu.id) : undefined

  function onDragStart(event: DragStartEvent) {
    setHeld(byId.get(String(event.active.id).split("|")[1]) ?? null)
  }

  /** A row let go: under its own day it takes its new place; under another day, it moves there. */
  function onDragEnd(event: DragEndEvent) {
    setHeld(null)
    const [fromKey, activityId] = String(event.active.id).split("|")
    const over = event.over ? String(event.over.id) : null
    const activity = byId.get(activityId)
    if (!over || !activity) return
    const toKey = over.startsWith(HEADING_DROP) ? over.slice(HEADING_DROP.length) : over.split("|")[0]
    const target = groups.find((group) => group.key === toKey)
    if (!target) return
    const rest = target.rows.map((row) => row.id).filter((id) => id !== activityId)
    const at = over.startsWith(HEADING_DROP) ? rest.length : Math.max(0, rest.indexOf(over.split("|")[1]))
    const order = [...rest.slice(0, at), activityId, ...rest.slice(at)]
    const before = groups.find((group) => group.key === fromKey)?.rows.map((row) => row.id) ?? []
    if (fromKey === toKey && order.join(",") === before.join(",")) return
    void actions.moveTo(activity, target.day, order)
  }

  return (
    <ScrollArea className="min-h-0 flex-1" viewportClassName="h-full">
      {canSelect && (sort !== "order" || direction !== "asc") ? (
        <div className="flex items-center gap-2 border-b px-4 py-2 text-sm text-muted-foreground">
          Sorted by a column, so rows can't be dragged.
          {/* Back to the day's own order, first to last: from another column, or from the order turned round. */}
          <Button type="button" variant="ghost" size="sm" onClick={() => toggleSort("order")}>
            Use the day's order
          </Button>
        </div>
      ) : null}
      <DndContext id={dndId} sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setHeld(null)}>
        {/* The first column 16px in, where the List tab's word starts, and the last 12px in, the header's own
            padding, as Project's list lines up with its header. With Mass select on, the tick box column is only as
            wide as the box and the drag handle sits close to it. */}
        <Table
          containerClassName="overflow-visible"
          className="[&_td:first-child]:pl-4 [&_td:last-child]:pr-3 [&_th:first-child]:pl-4 [&_th:last-child]:pr-3 [&_[data-column=select]]:w-8 [&_[data-column=select]]:min-w-8 [&_[data-column=select]+*]:pl-2"
        >
          <SortableTableHeader
            columns={COLUMNS}
            sort={sort}
            direction={direction}
            onSort={toggleSort}
            leading={
              canSelect ? (
                <SelectAllTableHead
                  noun="activities"
                  disabled={shownIds.length === 0}
                  checked={allTicked ? true : someTicked ? "indeterminate" : false}
                  onCheckedChange={() => onSelectMany(shownIds)}
                />
              ) : null
            }
          />
          <TableBody>
            {groups.map((group) => {
              const folded = folds.folded(group.key)
              return (
                <React.Fragment key={group.key}>
                  <DayHeading
                    groupKey={group.key}
                    label={group.label}
                    colSpan={colSpan}
                    dropZone={Boolean(held)}
                    onToggle={() => folds.toggle(group.key)}
                  >
                    {readOnly
                      ? null
                      : newActivity(
                          `list-${group.key}`,
                          group.day,
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            aria-label={`Add an activity to ${group.label}`}
                            className="opacity-0 group-hover/table-group:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100 [@media(hover:none)]:opacity-100"
                          >
                            <PlusIcon className="size-3.5" />
                          </Button>
                        )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={folded ? `Open ${group.label}` : `Fold ${group.label}`}
                      aria-expanded={!folded}
                      className="opacity-0 group-hover/table-group:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
                      onClick={() => folds.toggle(group.key)}
                    >
                      <ChevronDownIcon className={cn("size-3.5 transition-transform", folded && "-rotate-90")} />
                    </Button>
                  </DayHeading>
                  {folded ? null : group.rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={colSpan} className="py-1.5 text-xs text-muted-foreground">
                        Nothing planned
                      </TableCell>
                    </TableRow>
                  ) : (
                    <SortableContext items={group.rows.map((row) => `${group.key}|${row.id}`)} strategy={verticalListSortingStrategy}>
                      {group.rows.map((activity) => (
                        <ActivityRow
                          key={activity.id}
                          dragId={`${group.key}|${activity.id}`}
                          activity={activity}
                          open={activity.id === openActivityId}
                          canSelect={canSelect}
                          canDrag={canDrag}
                          ticked={selected.has(activity.id)}
                          onTick={() => onToggleSelected(activity.id)}
                          onOpen={() => openActivity(activity.id)}
                          actions={actions}
                          onMenu={readOnly ? undefined : (at) => setMenu({ id: activity.id, at })}
                        />
                      ))}
                    </SortableContext>
                  )}
                </React.Fragment>
              )
            })}
          </TableBody>
        </Table>
        <DragOverlay dropAnimation={null}>
          {held ? (
            <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm font-medium shadow-md">
              <ActivityTypeIcon type={typeOf(held, typesById)} />
              {held.title}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
      <ScrollBar orientation="horizontal" />
      {menu && menuActivity ? (
        <CardMenu
          key={menu.id + menu.at.x + menu.at.y}
          at={menu.at}
          activity={menuActivity}
          days={trip.days}
          startDate={trip.startDate}
          actions={actions}
          massSelect={onMassSelect ? { on: selecting, onToggle: () => onMassSelect(menuActivity.id) } : undefined}
          onOpen={() => openActivity(menuActivity.id)}
          onClose={() => setMenu(null)}
        />
      ) : null}
    </ScrollArea>
  )
}

/**
 * A day's heading, its name 16px in like the first column, at 14px and grey
 * with 10px above and below (Tyler, 3 Nov 2026: "this font should be bigger and
 * have more spacing", "make it gray color"). Pressed anywhere but a button, it
 * folds. While a row is held it takes a drop too, so an empty day can take one.
 */
function DayHeading({
  groupKey,
  label,
  colSpan,
  dropZone,
  onToggle,
  children,
}: {
  groupKey: string
  label: string
  colSpan: number
  dropZone: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  const { setNodeRef } = useDroppable({ id: `${HEADING_DROP}${groupKey}`, disabled: !dropZone })
  return (
    <TableGroupRow
      ref={setNodeRef}
      colSpan={colSpan}
      inset="1rem"
      label={label}
      className="cursor-pointer select-none [&>td]:py-2.5 [&>td]:text-sm [&>td]:text-muted-foreground"
      onClick={(event) => {
        const target = event.target
        if (target instanceof Element && target.closest("button, a, input, [role=menu]")) return
        onToggle()
      }}
    >
      {children}
    </TableGroupRow>
  )
}

function ActivityRow({
  dragId,
  activity,
  open,
  canSelect,
  canDrag,
  ticked,
  onTick,
  onOpen,
  actions,
  onMenu,
}: {
  dragId: string
  activity: Activity
  open: boolean
  canSelect: boolean
  canDrag: boolean
  ticked: boolean
  onTick: () => void
  onOpen: () => void
  actions: BoardActions
  onMenu?: (at: { x: number; y: number }) => void
}) {
  const { page, typesById, readOnly } = useTrip()
  const type = typeOf(activity, typesById)
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: dragId,
    disabled: !canDrag,
  })
  const style: React.CSSProperties | undefined = transform ? { transform: `translate3d(0, ${transform.y}px, 0)`, transition } : undefined
  return (
    <TableRow
      ref={setNodeRef}
      style={style}
      data-activity-id={activity.id}
      aria-current={open || undefined}
      // A little tighter than the shell's rows, as Project's list is.
      className={cn("group [&>td]:py-1", open && "bg-muted/60", activity.done && "text-muted-foreground", isDragging && "opacity-40")}
      rowAction={onOpen}
      onContextMenu={(event) => {
        if (!onMenu) return
        event.preventDefault()
        onMenu({ x: event.clientX, y: event.clientY })
      }}
    >
      {canSelect ? (
        <TableCell column="select">
          <Checkbox checked={ticked} onCheckedChange={onTick} aria-label={`Select ${activity.title}`} />
        </TableCell>
      ) : null}
      {/* Takes the width the other columns leave and cuts a long name short, so the row never runs past the panel. */}
      <TableCell column="main" className="w-full min-w-24 max-w-0">
        <span className="flex min-w-0 items-center gap-2">
          {canDrag ? (
            <button
              type="button"
              ref={setActivatorNodeRef}
              {...listeners}
              {...attributes}
              aria-label={`Drag ${activity.title} to another place or day`}
              className="-ml-1 flex size-6 shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <GripVerticalIcon className="size-4" aria-hidden />
            </button>
          ) : null}
          {/* The circle as it was, green once done (Tyler, 6 Nov 2026: "make the checkbox green color", then
              "it was eaasier to see, just chanbge the color"). */}
          {readOnly ? (
            activity.done ? (
              <CircleCheckIcon className="size-4 shrink-0 text-green-600" aria-label="Done" />
            ) : (
              <CircleIcon className="size-4 shrink-0 text-muted-foreground" aria-label="Not done" />
            )
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={activity.done ? `Mark ${activity.title} not done` : `Mark ${activity.title} done`}
              aria-pressed={activity.done}
              className="shrink-0"
              disabled={actions.busy}
              onClick={() => void actions.setField(activity, { done: !activity.done })}
            >
              {activity.done ? (
                <CircleCheckIcon className="size-4 text-green-600" />
              ) : (
                <CircleIcon className="size-4 text-muted-foreground" />
              )}
            </Button>
          )}
          <span className={cn("truncate font-medium", activity.done && "line-through")}>{activity.title}</span>
          {activity.nights && activity.nights > 1 ? (
            <span className="shrink-0 text-xs text-muted-foreground">{activity.nights} nights</span>
          ) : null}
        </span>
      </TableCell>
      <TableCell column="preview" className="tabular-nums">
        {formatWhen(activity) ?? ""}
      </TableCell>
      <TableCell column="preview">
        {readOnly ? (
          <span className="flex items-center gap-1.5">
            <ActivityTypeIcon type={type} />
            {type?.name ?? ""}
          </span>
        ) : (
          <TypeCellMenu activity={activity} />
        )}
      </TableCell>
      <TableCell column="preview" className="tabular-nums">
        {activity.costCents !== null ? formatMoney(activity.costCents, page.trip.currency) : ""}
      </TableCell>
    </TableRow>
  )
}

/** The Type cell, a dropdown of the person's types that saves on a pick, as Project's cells are. */
function TypeCellMenu({ activity }: { activity: Activity }) {
  const { page, typesById } = useTrip()
  const [save, busy] = useSaveActivity(activity.id)
  const type = typeOf(activity, typesById)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busy}
          aria-label={`Type: ${type?.name ?? "No type"}. Change it`}
          className="-ml-2 h-7 gap-1.5 px-2 font-normal"
        >
          <ActivityTypeIcon type={type} />
          <span className={cn(!type && "text-muted-foreground")}>{type?.name ?? "No type"}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-[min(60vh,24rem)] min-w-48">
        {[{ id: NO_TYPE, name: "No type" }, ...page.types].map((each) => {
          const picked = (activity.typeId ?? NO_TYPE) === each.id
          return (
            <DropdownMenuItem
              key={each.id}
              onSelect={() => {
                if (!picked) void save({ typeId: each.id === NO_TYPE ? null : each.id })
              }}
            >
              {each.id === NO_TYPE ? (
                <span className="text-muted-foreground">No type</span>
              ) : (
                <>
                  <ActivityTypeIcon type={typesById.get(each.id)} />
                  {each.name}
                </>
              )}
              {picked ? <CheckIcon className="ml-auto size-4" aria-label="Picked" /> : null}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Which days are folded shut on the List, kept per trip in this browser. */
function useListFolds(storageKey: string) {
  const [shut, setShut] = React.useState<ReadonlySet<string>>(() => new Set())
  React.useEffect(() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem(storageKey) ?? "[]")
      setShut(new Set(Array.isArray(stored) ? stored.filter((key): key is string => typeof key === "string") : []))
    } catch {
      setShut(new Set())
    }
  }, [storageKey])
  return {
    folded: (key: string) => shut.has(key),
    toggle: (key: string) => {
      const next = new Set(shut)
      if (!next.delete(key)) next.add(key)
      setShut(next)
      try {
        window.localStorage.setItem(storageKey, JSON.stringify([...next]))
      } catch {
        // A browser that won't store it still folds until the page is closed.
      }
    },
  }
}
