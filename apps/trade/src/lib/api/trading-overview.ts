import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import type { TradingOverview } from "@/lib/trade/dashboard/overview"
import type { TradingDashboardWidgetLayout } from "@/lib/trade/dashboard/widgets"
import { adminGet, adminPost } from "@/server/guards"
import {
  loadTradingDashboardWidgets,
  saveTradingDashboardWidgets,
} from "@/server/trade/prefs"
import { loadTradingOverview } from "@/server/trade/trading-overview"

import { createErrorMessage } from "./error-message"

const widgetId = z.enum(["equity", "active-trades", "trades"])
const layoutSchema = z.object({
  top: z.array(widgetId).max(4),
  left: z.array(widgetId).max(4),
  right: z.array(widgetId).max(4),
})

const loadPageFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(
    async ({
      context,
    }): Promise<{
      overview: TradingOverview
      layout: TradingDashboardWidgetLayout
    }> => {
      const layout = await loadTradingDashboardWidgets(context.user.id)
      const includeActiveTrades = Object.values(layout).some((ids) =>
        ids.includes("active-trades")
      )
      const overview = await loadTradingOverview(
        context.user.id,
        includeActiveTrades
      )
      return { overview, layout }
    }
  )

const loadLayoutFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }) => ({
    layout: await loadTradingDashboardWidgets(context.user.id),
  }))

const saveLayoutFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(layoutSchema)
  .handler(async ({ data, context }) => ({
    layout: await saveTradingDashboardWidgets(context.user.id, data),
  }))

export function loadTradingOverviewPage() {
  return loadPageFn()
}

export function loadTradingOverviewLayout() {
  return loadLayoutFn()
}

export function saveTradingOverviewLayout(
  layout: TradingDashboardWidgetLayout
) {
  return saveLayoutFn({ data: layout })
}

export const getTradingOverviewErrorMessage = createErrorMessage(
  {},
  "The trading overview could not be loaded. Try again."
)

export const getTradingOverviewLayoutErrorMessage = createErrorMessage(
  {},
  "The trading dashboard arrangement could not be saved. Try again."
)

export const getTradingOverviewLayoutLoadErrorMessage = createErrorMessage(
  {},
  "The trading dashboard arrangement could not be loaded. Try again."
)
