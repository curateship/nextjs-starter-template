import { createFileRoute } from "@tanstack/react-router"

import { tradePageTitle } from "@/app/page-title"
import { routeErrorComponent } from "@/components/shell/route-error"
import { TradingWidgetsSettingsPage } from "@/components/trade/trade-settings-page"
import {
  getTradingOverviewLayoutLoadErrorMessage,
  loadTradingOverviewLayout,
} from "@/lib/api/trading-overview"

export const Route = createFileRoute(
  "/_authenticated/admin/settings_/trading-widgets"
)({
  head: ({ matches }) => ({
    meta: [{ title: tradePageTitle(matches, "Settings") }],
  }),
  loader: loadTradingOverviewLayout,
  component: TradingWidgetsSettingsPage,
  errorComponent: routeErrorComponent(getTradingOverviewLayoutLoadErrorMessage),
})
