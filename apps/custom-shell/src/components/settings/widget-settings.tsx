import * as React from "react"
import {
  DndContext,
  closestCenter,
  pointerWithin,
  useDroppable,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { GripVertical, RotateCcwIcon, XIcon } from "lucide-react"

import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import {
  DRAG_HANDLE_CLASS,
  useNavSensors,
  useSortableRow,
} from "@/components/settings/nav-editor-shared"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  createDefaultDashboardWidgets,
  findDashboardWidget,
  findWidgetSlot,
  unplacedDashboardWidgets,
  DASHBOARD_WIDGET_SLOTS,
  type DashboardWidgetId,
  type DashboardWidgetLayout,
  type DashboardWidgetSlot,
} from "@/lib/dashboard/dashboard-widgets"
import { cn } from "@/lib/utils"

/**
 * Where each card on the Overview dashboard sits, arranged by dragging.
 *
 * Four places a widget can be: the strip across the top, the left column, the
 * right column, and the list at the bottom of everything that is not on the
 * dashboard at all. Dragging a widget down to that list is how a card is
 * switched off; dragging it back out is how it comes back.
 */

/** The three slots, plus the list of what is not on the dashboard. */
type WidgetContainer = DashboardWidgetSlot | "available"

const CONTAINER_DROP_PREFIX = "widget-container-"

const containerDropId = (container: WidgetContainer) =>
  `${CONTAINER_DROP_PREFIX}${container}`

function containerFromDropId(id: string): WidgetContainer | null {
  if (!id.startsWith(CONTAINER_DROP_PREFIX)) return null
  return id.slice(CONTAINER_DROP_PREFIX.length) as WidgetContainer
}

const SLOT_LABELS: Record<WidgetContainer, { title: string; hint: string }> = {
  top: {
    title: "Top",
    hint: "Full width, above the two columns.",
  },
  left: {
    title: "Left column",
    hint: "The wider of the two columns.",
  },
  right: {
    title: "Right column",
    hint: "The narrower one, beside it.",
  },
  available: {
    title: "Not on the dashboard",
    hint: "Drag one of these into a slot to put it on the page.",
  },
}

export function WidgetSettings({
  layout,
  onLayoutChange,
}: {
  layout: DashboardWidgetLayout
  onLayoutChange: (layout: DashboardWidgetLayout) => void
}) {
  const [resetOpen, setResetOpen] = React.useState(false)
  const sensors = useNavSensors()
  const available = unplacedDashboardWidgets(layout).map((widget) => widget.id)

  const findContainer = React.useCallback(
    (id: string): WidgetContainer | null => {
      const dropContainer = containerFromDropId(id)
      if (dropContainer) return dropContainer

      const widget = findDashboardWidget(id)
      if (!widget) return null

      return findWidgetSlot(layout, widget.id) ?? "available"
    },
    [layout]
  )

  /**
   * The widget lifted out of wherever it was and put down in `container`, at
   * `index` if the drag is pointing at a particular chip. Dropping it on the
   * bottom list simply leaves it out of all three slots — nothing else records
   * which widgets are off the dashboard.
   */
  const moveWidget = React.useCallback(
    (widgetId: DashboardWidgetId, container: WidgetContainer, index: number) => {
      const next = {} as DashboardWidgetLayout
      for (const slot of DASHBOARD_WIDGET_SLOTS) {
        next[slot] = layout[slot].filter((id) => id !== widgetId)
      }

      if (container !== "available") {
        const ids = next[container]
        const at = index < 0 || index > ids.length ? ids.length : index
        next[container] = [...ids.slice(0, at), widgetId, ...ids.slice(at)]
      }

      onLayoutChange(next)
    },
    [layout, onLayoutChange]
  )

  /**
   * Chips win over the box they are in, so a drag lands where it is pointing
   * rather than at the end of the slot. An empty slot has no chips to point at,
   * which is what its own drop box is for.
   */
  const collisionDetection = React.useCallback<CollisionDetection>((args) => {
    const pointerCollisions = pointerWithin(args)
    const chipCollisions = pointerCollisions.filter(
      (collision) => !containerFromDropId(String(collision.id))
    )
    if (chipCollisions.length) return chipCollisions
    if (pointerCollisions.length) return pointerCollisions

    return closestCenter(args)
  }, [])

  const handleRemove = (widgetId: DashboardWidgetId) => {
    moveWidget(widgetId, "available", -1)
  }

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event
    if (!over) return

    const widgetId = String(active.id) as DashboardWidgetId
    const activeContainer = findContainer(String(active.id))
    const overContainer = findContainer(String(over.id))
    if (!activeContainer || !overContainer) return
    if (activeContainer === overContainer) return

    const overIds =
      overContainer === "available" ? available : layout[overContainer]
    const overIndex = overIds.indexOf(String(over.id) as DashboardWidgetId)
    moveWidget(widgetId, overContainer, overIndex)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over) return

    const widgetId = String(active.id) as DashboardWidgetId
    const activeContainer = findContainer(String(active.id))
    const overContainer = findContainer(String(over.id))
    if (!activeContainer || !overContainer) return

    // The bottom list is in the catalogue's own order, so there is nothing to
    // reorder inside it — only in or out of it.
    if (activeContainer === overContainer) {
      if (overContainer === "available" || active.id === over.id) return

      const ids = layout[overContainer]
      const from = ids.indexOf(widgetId)
      const to = ids.indexOf(String(over.id) as DashboardWidgetId)
      if (from === -1 || to === -1 || from === to) return

      onLayoutChange({
        ...layout,
        [overContainer]: arrayMove(ids, from, to),
      })
      return
    }

    const overIds =
      overContainer === "available" ? available : layout[overContainer]
    moveWidget(
      widgetId,
      overContainer,
      overIds.indexOf(String(over.id) as DashboardWidgetId)
    )
  }

  return (
    <>
      <CollapsibleSettingsCard
        storageId="widgets"
        title="Dashboard widgets"
        description="Which cards your Overview dashboard shows, and where each one sits. Drag a widget between the slots, or down to the bottom list to take it off the page."
      >
        {/* A stable id keeps the server and browser renders in step, so the
            chips do not jump on the first paint the way an id mismatch makes
            dnd-kit re-mount them. */}
        <DndContext
          id="custom-shell-dashboard-widgets"
          sensors={sensors}
          collisionDetection={collisionDetection}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="grid gap-4">
            <WidgetSlotBox
              container="top"
              ids={layout.top}
              onRemove={handleRemove}
            />
            {/* Side by side on a desktop, the way they sit on the dashboard,
                and stacked on a phone where there is no room for two. */}
            <div className="grid gap-4 sm:grid-cols-2">
              <WidgetSlotBox
                container="left"
                ids={layout.left}
                onRemove={handleRemove}
              />
              <WidgetSlotBox
                container="right"
                ids={layout.right}
                onRemove={handleRemove}
              />
            </div>
            <WidgetSlotBox container="available" ids={available} />
          </div>
        </DndContext>
      </CollapsibleSettingsCard>

      {/* Outside the card, like the sidebar and menu tabs: it acts on the whole
          dashboard, not on anything inside the card. */}
      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
        <Button
          type="button"
          variant="destructive"
          onClick={() => setResetOpen(true)}
        >
          <RotateCcwIcon className="h-4 w-4" />
          Reset dashboard
        </Button>
      </div>

      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Reset the dashboard?"
        description="Every widget goes back to where it started: the headline figures across the top, Needs you and Latest activity down the left, and People, Traffic and Automations down the right. This cannot be undone."
        confirmLabel="Reset dashboard"
        onConfirm={() => {
          setResetOpen(false)
          onLayoutChange(createDefaultDashboardWidgets())
        }}
      />
    </>
  )
}

function WidgetSlotBox({
  container,
  ids,
  onRemove,
}: {
  container: WidgetContainer
  ids: DashboardWidgetId[]
  /** Left off for the bottom list, where there is nothing to take off. */
  onRemove?: (id: DashboardWidgetId) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: containerDropId(container) })
  const { title, hint } = SLOT_LABELS[container]

  return (
    // Rows pinned to `auto 1fr`: the two columns sit side by side in a grid, so
    // the taller one stretches the shorter one — and without this the shorter
    // one spreads that height between its heading and its box, leaving the two
    // headings on different lines.
    <div className="grid grid-rows-[auto_1fr] gap-2">
      <div className="grid gap-0.5">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          className={cn(
            // `self-start` so a tray is only as tall as what is in it. The two
            // columns sit in a grid row together, and left to stretch, the one
            // holding fewer widgets grows a band of empty grey to match its
            // neighbour.
            "grid self-start content-start gap-2 rounded-lg border border-dashed bg-muted p-2 transition-colors",
            // Only an empty tray keeps a floor, so there is something to aim a
            // drag at when it holds nothing — and its line sits in the middle
            // of that floor rather than at the top of it.
            ids.length === 0 && "min-h-24 content-center",
            isOver && "bg-primary/5"
          )}
        >
          {ids.map((id) => (
            <WidgetChip
              key={id}
              id={id}
              onRemove={onRemove ? () => onRemove(id) : undefined}
            />
          ))}
          {ids.length === 0 ? (
            <p className="self-center px-1 text-center text-xs text-muted-foreground">
              {container === "available"
                ? "Every widget is on the dashboard."
                : "Drag a widget here."}
            </p>
          ) : null}
        </div>
      </SortableContext>
    </div>
  )
}

function WidgetChip({
  id,
  onRemove,
}: {
  id: DashboardWidgetId
  onRemove?: () => void
}) {
  const { attributes, listeners, setNodeRef, style } = useSortableRow(id, true)
  const widget = findDashboardWidget(id)
  // Both lists are built from the same catalogue this reads, so a chip always
  // finds its widget. Guarded because dnd-kit hands ids back as plain strings.
  if (!widget) return null

  const Icon = widget.icon

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex min-w-0 items-center gap-1 rounded-lg border bg-background p-2 transition-colors hover:border-muted-foreground/50"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className={cn(DRAG_HANDLE_CLASS, "shrink-0")}
        aria-label={`Move ${widget.label}`}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{widget.label}</p>
        <p
          className="truncate text-xs text-muted-foreground"
          title={widget.description}
        >
          {widget.description}
        </p>
      </div>
      {/* Dragging a chip all the way down to the bottom list is the fiddly way
          to switch a card off, so every placed widget carries the quick one. */}
      {onRemove ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0"
          onClick={onRemove}
          aria-label={`Take ${widget.label} off the dashboard`}
          title={`Take ${widget.label} off the dashboard`}
        >
          <XIcon className="h-4 w-4" />
        </Button>
      ) : null}
    </div>
  )
}
