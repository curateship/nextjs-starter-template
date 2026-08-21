import { createFileRoute } from "@tanstack/react-router"

import { routeErrorComponent } from "@/components/shell/route-error"
import { TradingOverviewDashboard } from "@/components/trade/trading-overview-dashboard"
import {
  getTradingOverviewErrorMessage,
  loadTradingOverviewPage,
} from "@/lib/api/trading-overview"

export const Route = createFileRoute("/_authenticated/admin/trading-overview")({
  loader: loadTradingOverviewPage,
  component: TradingOverviewRoute,
  errorComponent: routeErrorComponent(getTradingOverviewErrorMessage),
})

function TradingOverviewRoute() {
  const { overview, layout } = Route.useLoaderData()
  return <TradingOverviewDashboard overview={overview} layout={layout} />
}
