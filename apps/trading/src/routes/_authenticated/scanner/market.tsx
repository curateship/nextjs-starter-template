import { createFileRoute } from "@tanstack/react-router"

import { MarketScannerDashboard } from "@/components/scanner/market-scanner-dashboard"
import { loadMarketScannerRulesPage } from "@/lib/api/market-scanner"

export const Route = createFileRoute("/_authenticated/scanner/market")({
  loader: () => loadMarketScannerRulesPage(),
  component: MarketScannerRoute,
})

function MarketScannerRoute() {
  return <MarketScannerDashboard initial={Route.useLoaderData()} />
}
