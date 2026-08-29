import { createFileRoute } from "@tanstack/react-router"

import { tradePageTitle } from "@/app/page-title"
import { routeErrorComponent } from "@/components/shell/route-error"
import { TradingEngineSettingsPage } from "@/components/workers/trading-engine-settings-page"
import {
  getTradingEngineSettingsErrorMessage,
  loadTradingEngineSettingsPage,
} from "@/lib/api/trade/trading-engine-settings"

export const Route = createFileRoute(
  "/_authenticated/admin/settings_/trading-engine"
)({
  head: ({ matches }) => ({
    meta: [{ title: tradePageTitle(matches, "Settings") }],
  }),
  loader: loadTradingEngineSettingsPage,
  component: TradingEngineSettingsPage,
  errorComponent: routeErrorComponent(getTradingEngineSettingsErrorMessage),
})
