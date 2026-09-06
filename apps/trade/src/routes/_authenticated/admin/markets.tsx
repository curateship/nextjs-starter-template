import { createFileRoute } from "@tanstack/react-router"

import { tradePageTitle } from "@/app/page-title"
import { routeErrorComponent } from "@/components/shell/route-error"
import { MarketExplorerPage } from "@/components/trade/market-explorer/market-explorer-page"
import { loadMarketExplorer } from "@/lib/api/trade/market-explorer"

export const Route = createFileRoute("/_authenticated/admin/markets")({
  head: ({ matches }) => ({
    meta: [{ title: tradePageTitle(matches, "Markets") }],
  }),
  loader: () => loadMarketExplorer(),
  component: MarketsRoute,
  errorComponent: routeErrorComponent(
    () => "Markets could not load your account settings. Try again."
  ),
})
function MarketsRoute() {
  return <MarketExplorerPage opening={Route.useLoaderData()} />
}
