import { createFileRoute } from "@tanstack/react-router"

import { MarketScannerAlertsDashboard } from "@/components/scanner/market-scanner-dashboard"
import { loadMarketScannerAlertsPage } from "@/lib/api/market-scanner"

export const Route = createFileRoute("/_authenticated/scanner/market-alerts")({
  loader: () => loadMarketScannerAlertsPage(),
  component: MarketScannerAlertsRoute,
})

function MarketScannerAlertsRoute() {
  return <MarketScannerAlertsDashboard initial={Route.useLoaderData()} />
}
