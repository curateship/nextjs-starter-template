import { createFileRoute } from "@tanstack/react-router"

import { tradePageTitle, useTradePageTitle } from "@/app/page-title"
import { routeErrorComponent } from "@/components/shell/route-error"
import { TradingOverviewDashboard } from "@/components/trade/trading-overview-dashboard"
import {
  getTradingOverviewErrorMessage,
  loadTradingOverviewPage,
} from "@/lib/api/trade/trading-overview"

export const Route = createFileRoute("/_authenticated/admin/trading-overview")({
  head: ({ matches }) => ({
    meta: [{ title: tradePageTitle(matches, "Trading overview") }],
  }),
  loader: loadTradingOverviewPage,
  component: TradingOverviewRoute,
  errorComponent: routeErrorComponent(getTradingOverviewErrorMessage),
})

function TradingOverviewRoute() {
  useTradePageTitle("Trading overview")
  const { overview, layout } = Route.useLoaderData()
  return <TradingOverviewDashboard overview={overview} layout={layout} />
}
