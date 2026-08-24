import {
  ChartNoAxesCombinedIcon,
  ListChecksIcon,
  ListIcon,
  type LucideIcon,
} from "lucide-react"

export const TRADING_DASHBOARD_WIDGET_SLOTS = ["top", "left", "right"] as const

export type TradingDashboardWidgetSlot =
  (typeof TRADING_DASHBOARD_WIDGET_SLOTS)[number]

export type TradingDashboardWidgetId = "equity" | "active-trades" | "trades"

export type TradingDashboardWidgetLayout = Record<
  TradingDashboardWidgetSlot,
  TradingDashboardWidgetId[]
>

export type TradingDashboardWidget = {
  id: TradingDashboardWidgetId
  label: string
  description: string
  icon: LucideIcon
  size: number
  minSize: string
}

const TRADING_DASHBOARD_WIDGETS: TradingDashboardWidget[] = [
  {
    id: "equity",
    label: "PnL Graph",
    description: "The account result, every real wallet, and money over time.",
    icon: ChartNoAxesCombinedIcon,
    size: 10,
    minSize: "40%",
  },
  {
    id: "active-trades",
    label: "Active Trades",
    description: "Every open trade across all protocols and wallets.",
    icon: ListChecksIcon,
    size: 10,
    minSize: "28%",
  },
  {
    id: "trades",
    label: "All trades",
    description: "Every recorded real fill, newest first, with its exchange.",
    icon: ListIcon,
    size: 10,
    minSize: "28%",
  },
]

const widgetsById = new Map(
  TRADING_DASHBOARD_WIDGETS.map((widget) => [widget.id, widget])
)

export function findTradingDashboardWidget(
  id: string
): TradingDashboardWidget | undefined {
  return widgetsById.get(id as TradingDashboardWidgetId)
}

export function createDefaultTradingDashboardWidgets(): TradingDashboardWidgetLayout {
  return {
    top: ["equity", "active-trades"],
    left: [],
    right: ["trades"],
  }
}

export function normalizeTradingDashboardWidgets(
  value: unknown
): TradingDashboardWidgetLayout {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return createDefaultTradingDashboardWidgets()
  }

  const saved = value as Partial<Record<TradingDashboardWidgetSlot, unknown>>
  if (
    !TRADING_DASHBOARD_WIDGET_SLOTS.some((slot) => Array.isArray(saved[slot]))
  ) {
    return createDefaultTradingDashboardWidgets()
  }

  const seen = new Set<TradingDashboardWidgetId>()
  const layout = {} as TradingDashboardWidgetLayout
  for (const slot of TRADING_DASHBOARD_WIDGET_SLOTS) {
    const ids = Array.isArray(saved[slot]) ? (saved[slot] as unknown[]) : []
    layout[slot] = ids.flatMap((raw) => {
      if (typeof raw !== "string") return []
      const id = raw as TradingDashboardWidgetId
      if (!widgetsById.has(id) || seen.has(id)) return []
      seen.add(id)
      return [id]
    })
  }
  return layout
}

export function findTradingWidgetSlot(
  layout: TradingDashboardWidgetLayout,
  id: TradingDashboardWidgetId
): TradingDashboardWidgetSlot | null {
  return (
    TRADING_DASHBOARD_WIDGET_SLOTS.find((slot) => layout[slot].includes(id)) ??
    null
  )
}

export function unplacedTradingDashboardWidgets(
  layout: TradingDashboardWidgetLayout
): TradingDashboardWidget[] {
  const placed = new Set(
    TRADING_DASHBOARD_WIDGET_SLOTS.flatMap((slot) => layout[slot])
  )
  return TRADING_DASHBOARD_WIDGETS.filter((widget) => !placed.has(widget.id))
}

export function isTradingDashboardEmpty(layout: TradingDashboardWidgetLayout) {
  return TRADING_DASHBOARD_WIDGET_SLOTS.every(
    (slot) => layout[slot].length === 0
  )
}
