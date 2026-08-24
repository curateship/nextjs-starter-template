import { createFileRoute } from "@tanstack/react-router"

import { tradePageTitle } from "@/app/page-title"
import { routeErrorComponent } from "@/components/shell/route-error"
import { MarketsSettingsPage } from "@/components/trade/trade-settings-page"
import {
  getMarketSettingsLoadErrorMessage,
  loadMarketSettings,
} from "@/lib/api/market-settings"

export const Route = createFileRoute("/_authenticated/admin/settings_/markets")(
  {
    head: ({ matches }) => ({
      meta: [{ title: tradePageTitle(matches, "Settings") }],
    }),
    loader: loadMarketSettings,
    component: MarketsSettingsPage,
    errorComponent: routeErrorComponent(getMarketSettingsLoadErrorMessage),
  }
)
