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
import { GripVerticalIcon, RotateCcwIcon, XIcon } from "lucide-react"

import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import {
  DRAG_HANDLE_CLASS,
  useNavSensors,
  useSortableRow,
} from "@/components/settings/nav-editor-shared"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useTradeSettingsBootstrap } from "@/components/trade/trade-settings-context"
import {
  getTradingOverviewLayoutErrorMessage,
  getTradingOverviewLayoutLoadErrorMessage,
  loadTradingOverviewLayout,
  saveTradingOverviewLayout,
} from "@/lib/api/trade/trading-overview"
import {
  createDefaultTradingDashboardWidgets,
  findTradingDashboardWidget,
  findTradingWidgetSlot,
  unplacedTradingDashboardWidgets,
  TRADING_DASHBOARD_WIDGET_SLOTS,
  type TradingDashboardWidgetId,
  type TradingDashboardWidgetLayout,
  type TradingDashboardWidgetSlot,
} from "@/lib/trade/dashboard/widgets"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

type WidgetContainer = TradingDashboardWidgetSlot | "available"

const DROP_PREFIX = "trading-widget-container-"

const SLOT_LABELS: Record<WidgetContainer, { title: string; hint: string }> = {
  top: { title: "Top", hint: "Full width, above the two columns." },
  left: { title: "Left column", hint: "The wider of the two columns." },
  right: {
    title: "Right column",
    hint: "The narrower one, beside it.",
  },
  available: {
    title: "Not on the dashboard",
    hint: "Drag one of these into a slot to put it on the page.",
  },
}

const dropId = (container: WidgetContainer) => `${DROP_PREFIX}${container}`

function containerFromDropId(id: string): WidgetContainer | null {
  if (!id.startsWith(DROP_PREFIX)) return null
  return id.slice(DROP_PREFIX.length) as WidgetContainer
}

export default function TradingDashboardWidgetSettings() {
  const bootstrap = useTradeSettingsBootstrap()
  const [layout, setLayout] =
    React.useState<TradingDashboardWidgetLayout | null>(
      bootstrap?.tradingWidgets ?? null
    )
  const [loadFailed, setLoadFailed] = React.useState(false)
  const saved = React.useRef<TradingDashboardWidgetLayout | null>(
    bootstrap?.tradingWidgets ?? null
  )
  const pending = React.useRef<TradingDashboardWidgetLayout | null>(null)
  const saving = React.useRef(false)
  const mounted = React.useRef(true)

  const loadLayout = React.useCallback(() => {
    void loadTradingOverviewLayout()
      .then(({ layout: loaded }) => {
        if (!mounted.current) return
        saved.current = loaded
        setLayout(loaded)
      })
      .catch((error) => {
        if (!mounted.current) return
        setLoadFailed(true)
        showErrorToast(getTradingOverviewLayoutLoadErrorMessage(error))
      })
  }, [])

  React.useEffect(() => {
    mounted.current = true
    if (!bootstrap?.tradingWidgets) loadLayout()
    return () => {
      mounted.current = false
    }
  }, [bootstrap?.tradingWidgets, loadLayout])

  const persistLatest = React.useCallback(async () => {
    if (saving.current) return
    saving.current = true
    while (pending.current) {
      const next = pending.current
      pending.current = null
      try {
        const answer = await saveTradingOverviewLayout(next)
        saved.current = answer.layout
      } catch (error) {
        pending.current = null
        if (saved.current) setLayout(saved.current)
        showErrorToast(getTradingOverviewLayoutErrorMessage(error))
      }
    }
    saving.current = false
  }, [])

  const changeLayout = React.useCallback(
    (next: TradingDashboardWidgetLayout) => {
      setLayout(next)
      pending.current = next
      void persistLatest()
    },
    [persistLatest]
  )

  if (!layout) {
    if (loadFailed) {
      return (
        <Card>
          <CardContent className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              The trading widgets could not be loaded.
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setLoadFailed(false)
                loadLayout()
              }}
            >
              Try again
            </Button>
          </CardContent>
        </Card>
      )
    }
    return <p className="text-sm text-muted-foreground">Loading widgets…</p>
  }

  return <WidgetEditor layout={layout} onLayoutChange={changeLayout} />
}

function WidgetEditor({
  layout,
  onLayoutChange,
}: {
  layout: TradingDashboardWidgetLayout
  onLayoutChange: (layout: TradingDashboardWidgetLayout) => void
}) {
  const [resetOpen, setResetOpen] = React.useState(false)
  const sensors = useNavSensors()
  const available = unplacedTradingDashboardWidgets(layout).map(
    (widget) => widget.id
  )

  const findContainer = React.useCallback(
    (id: string): WidgetContainer | null => {
      const container = containerFromDropId(id)
      if (container) return container
      const widget = findTradingDashboardWidget(id)
      if (!widget) return null
      return findTradingWidgetSlot(layout, widget.id) ?? "available"
    },
    [layout]
  )

  const moveWidget = React.useCallback(
    (
      widgetId: TradingDashboardWidgetId,
      container: WidgetContainer,
      index: number
    ) => {
      const next = {} as TradingDashboardWidgetLayout
      for (const slot of TRADING_DASHBOARD_WIDGET_SLOTS) {
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

  const collisionDetection = React.useCallback<CollisionDetection>((args) => {
    const collisions = pointerWithin(args)
    const widgets = collisions.filter(
      (collision) => !containerFromDropId(String(collision.id))
    )
    if (widgets.length) return widgets
    if (collisions.length) return collisions
    return closestCenter(args)
  }, [])

  const handleDragOver = (event: DragOverEvent) => {
    if (!event.over) return
    const widgetId = String(event.active.id) as TradingDashboardWidgetId
    const from = findContainer(String(event.active.id))
    const to = findContainer(String(event.over.id))
    if (!from || !to || from === to) return
    const ids = to === "available" ? available : layout[to]
    moveWidget(
      widgetId,
      to,
      ids.indexOf(String(event.over.id) as TradingDashboardWidgetId)
    )
  }

  const handleDragEnd = (event: DragEndEvent) => {
    if (!event.over) return
    const widgetId = String(event.active.id) as TradingDashboardWidgetId
    const from = findContainer(String(event.active.id))
    const to = findContainer(String(event.over.id))
    if (!from || !to) return
    if (from === to) {
      if (to === "available" || event.active.id === event.over.id) return
      const ids = layout[to]
      const fromIndex = ids.indexOf(widgetId)
      const toIndex = ids.indexOf(
        String(event.over.id) as TradingDashboardWidgetId
      )
      if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return
      onLayoutChange({ ...layout, [to]: arrayMove(ids, fromIndex, toIndex) })
      return
    }
    const ids = to === "available" ? available : layout[to]
    moveWidget(
      widgetId,
      to,
      ids.indexOf(String(event.over.id) as TradingDashboardWidgetId)
    )
  }

  return (
    <>
      <CollapsibleSettingsCard
        storageId="trading-widgets"
        title="Trading dashboard widgets"
        description="Which cards the trading overview shows, and where each one sits. The platform Overview has its own Widgets tab and its own arrangement."
      >
        <DndContext
          id="trade-dashboard-widgets"
          sensors={sensors}
          collisionDetection={collisionDetection}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="grid gap-4">
            <WidgetSlot
              container="top"
              ids={layout.top}
              onRemove={(id) => moveWidget(id, "available", -1)}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <WidgetSlot
                container="left"
                ids={layout.left}
                onRemove={(id) => moveWidget(id, "available", -1)}
              />
              <WidgetSlot
                container="right"
                ids={layout.right}
                onRemove={(id) => moveWidget(id, "available", -1)}
              />
            </div>
            <WidgetSlot container="available" ids={available} />
          </div>
        </DndContext>
      </CollapsibleSettingsCard>

      <div className="mt-3 flex justify-end">
        <Button
          type="button"
          variant="destructive"
          onClick={() => setResetOpen(true)}
        >
          <RotateCcwIcon className="size-4" />
          Reset dashboard
        </Button>
      </div>

      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Reset the trading dashboard?"
        description="PnL Graph and Active Trades return to the top, Running bots returns to the left, and All trades returns to the right. The platform Overview is not changed. This cannot be undone."
        confirmLabel="Reset dashboard"
        onConfirm={() => {
          setResetOpen(false)
          onLayoutChange(createDefaultTradingDashboardWidgets())
        }}
      />
    </>
  )
}

function WidgetSlot({
  container,
  ids,
  onRemove,
}: {
  container: WidgetContainer
  ids: TradingDashboardWidgetId[]
  onRemove?: (id: TradingDashboardWidgetId) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: dropId(container) })
  const words = SLOT_LABELS[container]
  return (
    <div className="grid grid-rows-[auto_1fr] gap-2">
      <div className="grid gap-0.5">
        <p className="text-sm font-medium">{words.title}</p>
        <p className="text-xs text-muted-foreground">{words.hint}</p>
      </div>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          className={cn(
            "grid content-start gap-2 self-start rounded-lg border border-dashed bg-muted p-2 transition-colors",
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
            <p className="px-1 text-center text-xs text-muted-foreground">
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
  id: TradingDashboardWidgetId
  onRemove?: () => void
}) {
  const { attributes, listeners, setNodeRef, style } = useSortableRow(id, true)
  const widget = findTradingDashboardWidget(id)
  if (!widget) return null
  const Icon = widget.icon
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex min-w-0 items-center gap-1 rounded-lg border bg-background p-2"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className={cn(DRAG_HANDLE_CLASS, "shrink-0")}
        aria-label={`Move ${widget.label}`}
      >
        <GripVerticalIcon className="size-4" />
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
          <XIcon className="size-4" />
        </Button>
      ) : null}
    </div>
  )
}
