import { createFileRoute } from "@tanstack/react-router"

import { tradePageTitle } from "@/app/page-title"
import { routeErrorComponent } from "@/components/shell/route-error"
import { TradingRulesSettingsPage } from "@/components/trade/trade-settings-page"
import {
  getTradingRulesLoadErrorMessage,
  loadTradingRulesSettings,
} from "@/lib/api/trade/trading-rules"

export const Route = createFileRoute(
  "/_authenticated/admin/settings_/trading-rules"
)({
  head: ({ matches }) => ({
    meta: [{ title: tradePageTitle(matches, "Settings") }],
  }),
  loader: loadTradingRulesSettings,
  component: TradingRulesSettingsPage,
  errorComponent: routeErrorComponent(getTradingRulesLoadErrorMessage),
})
