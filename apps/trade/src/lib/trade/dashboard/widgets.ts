import {
  BotIcon,
  CalendarDaysIcon,
  ChartNoAxesCombinedIcon,
  ListChecksIcon,
  ListIcon,
  TrendingUpIcon,
} from "lucide-react"

import {
  cleanWidgetLayout,
  type WidgetChoice,
  type WidgetLayout,
  type WidgetOffer,
} from "@/lib/admin-dashboard/overview-widgets"

/**
 * Overview's widgets on the Trade dashboard (Tyler, 8 Nov 2026: "The widgets
 * gets moved to the middle like how shell does it (widgets are not in
 * settings)"). They sit in the shell's rows: a top row of 1 to 4 columns and
 * a bottom row of None or 1 to 4, each column a spot holding one widget or
 * Empty (`src/lib/admin-dashboard/overview-widgets.ts`). Only Trade's six are
 * offered ("Trade's six only"), and the layout is each person's own ("Per
 * account"), saved in `trade_prefs.overview_widgets`.
 */

export type TradingDashboardWidgetId =
  | "equity"
  | "active-trades"
  | "running-bots"
  | "profit-calendar"
  | "trades"
  | "moving-now"

export const TRADING_DASHBOARD_WIDGETS = [
  { id: "equity", label: "PnL Graph", icon: ChartNoAxesCombinedIcon },
  { id: "active-trades", label: "Active Trades", icon: ListChecksIcon },
  { id: "running-bots", label: "Running bots", icon: BotIcon },
  { id: "profit-calendar", label: "Profit calendar", icon: CalendarDaysIcon },
  { id: "trades", label: "All trades", icon: ListIcon },
  { id: "moving-now", label: "Moving now", icon: TrendingUpIcon },
] as const satisfies readonly (WidgetChoice & { id: TradingDashboardWidgetId })[]

export const TRADING_DASHBOARD_WIDGET_IDS: readonly TradingDashboardWidgetId[] =
  TRADING_DASHBOARD_WIDGETS.map((widget) => widget.id)

/** What the grid, its Widgets tab and each widget's ⋮ offer. */
export const TRADING_WIDGET_OFFER: WidgetOffer = {
  choices: TRADING_DASHBOARD_WIDGETS,
}

export function findTradingDashboardWidget(id: string) {
  return TRADING_DASHBOARD_WIDGETS.find((widget) => widget.id === id)
}

/**
 * A fresh start ("Shell's rows, fresh start"): PnL Graph and Active Trades on
 * top, Running bots and All trades under them. Profit calendar and Moving now
 * wait in the Widgets tab until placed.
 */
export const DEFAULT_TRADING_WIDGET_LAYOUT: WidgetLayout = {
  top: { columns: 2, spots: ["equity", "active-trades"] },
  bottom: { columns: 2, spots: ["running-bots", "trades"] },
}

/** A stored or sent layout made safe; nothing stored reads as the fresh start. */
export function readTradingWidgetLayout(value: unknown): WidgetLayout {
  return cleanWidgetLayout(value ?? undefined, TRADING_DASHBOARD_WIDGET_IDS, DEFAULT_TRADING_WIDGET_LAYOUT)
}

/** Every widget a layout shows: the filled spots in the rows that show. */
function placedWidgets(layout: WidgetLayout): Set<string> {
  const rows = layout.bottom.columns > 0 ? [layout.top, layout.bottom] : [layout.top]
  return new Set(rows.flatMap((row) => row.spots.filter((id): id is string => id !== null)))
}

/** The optional reads behind widgets that may not be on this Overview. */
export function tradingOverviewWidgetReads(layout: WidgetLayout) {
  const placed = placedWidgets(layout)
  return {
    includeActiveTrades: placed.has("active-trades"),
    includeBots: placed.has("running-bots"),
  }
}
