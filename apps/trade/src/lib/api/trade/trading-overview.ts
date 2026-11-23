import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import type { WidgetLayout } from "@/lib/admin-dashboard/overview-widgets"
import type { TradingOverview } from "@/lib/trade/dashboard/overview"
import {
  TRADING_DASHBOARD_WIDGET_IDS,
  tradingOverviewWidgetReads,
} from "@/lib/trade/dashboard/widgets"
import { userGet, userPost } from "@/server/guards"
import {
  loadTradingOverviewWidgets,
  saveTradingOverviewWidgets,
} from "@/server/trade/prefs"
import { loadTradingOverview } from "@/server/trade/trading-overview"

import { createErrorMessage } from "../error-message"

/**
 * The Trade dashboard's Overview: its widgets' figures and where each widget
 * sits. Every figure and the layout are the signed-in person's own, so a
 * member opens their own Overview as an admin does (Tyler, 8 Nov 2026:
 * "Everyone, own money").
 */

const spot = z.enum(TRADING_DASHBOARD_WIDGET_IDS as [string, ...string[]]).nullable()
const row = z.object({ columns: z.number().int().min(0).max(4), spots: z.array(spot).max(4) })
const layoutSchema = z.object({ top: row, bottom: row })

const loadPageFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(
    async ({
      context,
    }): Promise<{
      overview: TradingOverview
      layout: WidgetLayout
    }> => {
      const layout = await loadTradingOverviewWidgets(context.user.id)
      const { includeActiveTrades, includeBots } =
        tradingOverviewWidgetReads(layout)
      const overview = await loadTradingOverview(
        context.user.id,
        includeActiveTrades,
        includeBots
      )
      return { overview, layout }
    }
  )

const loadLayoutFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(({ context }) => loadTradingOverviewWidgets(context.user.id))

const saveLayoutFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(layoutSchema)
  .handler(({ data, context }) =>
    saveTradingOverviewWidgets(context.user.id, data)
  )

/** The figures and the layout, together, as Overview opens and every fifteen seconds after. */
export function loadTradingOverviewPage() {
  return loadPageFn()
}

/** The layout alone, for the left page's Widgets tab and Overview's count. */
export function loadTradingOverviewLayout() {
  return loadLayoutFn()
}

/** The whole layout, saved for this person and answered as stored. */
export function saveTradingOverviewLayout(layout: WidgetLayout) {
  return saveLayoutFn({ data: layout })
}

export const getTradingOverviewErrorMessage = createErrorMessage(
  {},
  "The trading overview could not be loaded. Try again."
)
