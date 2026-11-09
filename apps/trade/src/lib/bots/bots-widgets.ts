import { BotIcon } from "lucide-react"

import {
  cleanWidgetLayout,
  type WidgetChoice,
  type WidgetLayout,
  type WidgetOffer,
} from "@/lib/admin-dashboard/overview-widgets"

/**
 * The Bots dashboard's Overview widgets, in the shell's rows (Tyler, 9 Nov
 * 2026: an Overview row first in the Dashboards block). Running bots is the
 * one widget to start; widgets for backtests come later. Running bots stays
 * on the Trade Overview too ("Both dashboards"). The layout is each person's
 * own, saved in `trade_prefs.bots_widgets`, apart from the Trade Overview's.
 */
export type BotsWidgetId = "running-bots"

export const BOTS_WIDGETS = [
  { id: "running-bots", label: "Running bots", icon: BotIcon },
] as const satisfies readonly (WidgetChoice & { id: BotsWidgetId })[]

export const BOTS_WIDGET_IDS: readonly BotsWidgetId[] = BOTS_WIDGETS.map((widget) => widget.id)

/** What the grid, its Widgets tab and each widget's ⋮ offer. */
export const BOTS_WIDGET_OFFER: WidgetOffer = { choices: BOTS_WIDGETS }

export function findBotsWidget(id: string) {
  return BOTS_WIDGETS.find((widget) => widget.id === id)
}

/** A fresh start: Running bots across the top row, no bottom row. */
export const DEFAULT_BOTS_WIDGET_LAYOUT: WidgetLayout = {
  top: { columns: 1, spots: ["running-bots"] },
  bottom: { columns: 0, spots: [] },
}

/** A stored or sent layout made safe; nothing stored reads as the fresh start. */
export function readBotsWidgetLayout(value: unknown): WidgetLayout {
  return cleanWidgetLayout(value ?? undefined, BOTS_WIDGET_IDS, DEFAULT_BOTS_WIDGET_LAYOUT)
}
