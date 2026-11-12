import * as React from "react"
import { closestCenter, DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core"
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { EyeIcon, EyeOffIcon, GripVerticalIcon } from "lucide-react"

import { DashboardsRows } from "@/components/shared/notes/dashboards-rows"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import {
  loadProtocolPositionCounts,
  type ProtocolPositionCounts,
} from "@/lib/api/trade/trade-dashboard"
import { protocolLabel, type ProtocolId } from "@/lib/protocols/contracts"
import { cn } from "@/lib/utils"
import { OVERVIEW_VIEW, type DashboardView } from "@/lib/trade/dashboard-view"

/**
 * The Protocols block's rows (Tyler, 8 Nov 2026: "The protocols now goes
 * into the left panel as a block"): Overview first ("First row of
 * Protocols"), then each exchange shown, drawn as the shell's Dashboards
 * block draws its sections, with the sliding bar before the picked row.
 *
 * - **Overview** counts the widgets it shows, as the shell's Overview row does.
 * - **An exchange** counts its open positions ("Open positions"). A count
 *   that is still being read, or that could not be read, shows no number.
 */
export function ProtocolsRows({
  view,
  protocols,
  widgets,
  counts,
  onPick,
}: {
  view: DashboardView
  protocols: readonly ProtocolId[]
  /** How many widgets Overview shows, or null while its layout is read. */
  widgets: number | null
  counts: ProtocolPositionCounts | null
  onPick: (view: DashboardView) => void
}) {
  const sections = [
    {
      key: OVERVIEW_VIEW as DashboardView,
      label: "Overview",
      value: widgets === null ? undefined : String(widgets),
    },
    ...protocols.map((protocol) => {
      const count = counts?.[protocol]
      return {
        key: protocol as DashboardView,
        label: protocolLabel(protocol),
        value: count === undefined ? undefined : count.toLocaleString(),
      }
    }),
  ]
  return <DashboardsRows sections={sections} current={view} onPick={onPick} />
}

/**
 * The Protocols block's own rows in its ⋮ (Tyler, 8 Nov 2026: "the protocols
 * show and hide should be edited here and use the eye icon with a slash to
 * hide/unhide"): every exchange, an open eye on one that shows and an eye with
 * a slash on one that is hidden. One press swaps it and the menu stays open
 * for the next. Hiding the exchange on screen keeps its row in the block
 * until another row is picked, so the page never shows a row that is gone.
 *
 * Each row also drags into a new order by its grip or its name (Tyler, 11 Nov
 * 2026: "add ability to drag and drop order for trade dashboard"), drawn as
 * the shell's Dashboards block ⋮ draws its rows: a move of 6px or more is a
 * drag, and the press that ends one does not swap the eye. The block's rows
 * follow the same order.
 */
export function ProtocolsMenuRows({
  all,
  hidden,
  onHiddenChange,
  onOrderChange,
}: {
  /** Every exchange, in the block's order. */
  all: readonly ProtocolId[]
  hidden: readonly ProtocolId[]
  onHiddenChange: (hidden: ProtocolId[]) => void
  onOrderChange: (order: ProtocolId[]) => void
}) {
  const dragged = React.useRef(false)
  // The pointer only: the menu's own keys move between rows and press one.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const end = (event: DragEndEvent) => {
    window.setTimeout(() => {
      dragged.current = false
    }, 0)
    const from = all.indexOf(event.active.id as ProtocolId)
    const to = event.over ? all.indexOf(event.over.id as ProtocolId) : -1
    if (from < 0 || to < 0 || from === to) return
    onOrderChange(arrayMove([...all], from, to))
  }
  return (
    <DndContext
      id="protocols-menu-rows"
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={() => {
        dragged.current = true
      }}
      onDragCancel={() => {
        dragged.current = false
      }}
      onDragEnd={end}
    >
      <SortableContext items={[...all]} strategy={verticalListSortingStrategy}>
        {all.map((protocol) => {
          const isHidden = hidden.includes(protocol)
          return (
            <ProtocolMenuRow
              key={protocol}
              protocol={protocol}
              isHidden={isHidden}
              dragged={dragged}
              onToggle={() =>
                onHiddenChange(
                  isHidden ? hidden.filter((id) => id !== protocol) : [...hidden, protocol]
                )
              }
            />
          )
        })}
      </SortableContext>
    </DndContext>
  )
}

function ProtocolMenuRow({
  protocol,
  isHidden,
  dragged,
  onToggle,
}: {
  protocol: ProtocolId
  isHidden: boolean
  dragged: React.RefObject<boolean>
  onToggle: () => void
}) {
  const { listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: protocol })
  const Icon = isHidden ? EyeOffIcon : EyeIcon
  return (
    <DropdownMenuItem
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("touch-none", isDragging && "relative z-10 bg-accent")}
      aria-label={`${isHidden ? "Show" : "Hide"} ${protocolLabel(protocol)}`}
      // Only the pointer handlers: the drag's own role and tab stop would
      // take the row's place in the menu for a screen reader.
      {...listeners}
      onSelect={(event) => {
        event.preventDefault()
        if (dragged.current) return
        onToggle()
      }}
    >
      <GripVerticalIcon aria-hidden className="-ml-1 size-3.5 text-muted-foreground/60" />
      <span className={cn("min-w-0 flex-1 truncate", isHidden && "text-muted-foreground")}>
        {protocolLabel(protocol)}
      </span>
      <Icon className="ml-auto size-4 text-muted-foreground" />
    </DropdownMenuItem>
  )
}

/** How often the open positions are read again while the browser tab is visible. */
const COUNTS_REFRESH_MS = 30_000

/**
 * The open positions on each exchange, read as the dashboard opens and every
 * thirty seconds while the browser tab is visible. Every exchange is asked,
 * so it is read less often than one exchange's own tables are. A failed read
 * keeps the last counts on screen; with none yet, the rows show no number.
 */
export function useProtocolPositionCounts() {
  const [counts, setCounts] = React.useState<ProtocolPositionCounts | null>(null)
  React.useEffect(() => {
    let stopped = false
    let timer: number | null = null
    let inFlight = false
    const schedule = () => {
      if (stopped || document.visibilityState !== "visible") return
      if (timer !== null) window.clearTimeout(timer)
      timer = window.setTimeout(run, COUNTS_REFRESH_MS)
    }
    const run = () => {
      timer = null
      if (stopped || inFlight || document.visibilityState !== "visible") return
      inFlight = true
      loadProtocolPositionCounts()
        .then((fresh) => {
          if (!stopped) setCounts(fresh)
        })
        .catch(() => {
          // The last counts stay; the next read tries again.
        })
        .finally(() => {
          inFlight = false
          schedule()
        })
    }
    const onVisibilityChange = () => {
      if (timer !== null) window.clearTimeout(timer)
      timer = null
      if (document.visibilityState === "visible") run()
    }
    run()
    document.addEventListener("visibilitychange", onVisibilityChange)
    return () => {
      stopped = true
      if (timer !== null) window.clearTimeout(timer)
      document.removeEventListener("visibilitychange", onVisibilityChange)
    }
  }, [])
  return counts
}
