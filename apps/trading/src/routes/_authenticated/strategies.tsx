import { createFileRoute } from "@tanstack/react-router"

import { StrategyManager } from "@/components/strategies/strategy-manager"
import { loadStrategyLibrary } from "@/lib/api/strategies"

export const Route = createFileRoute("/_authenticated/strategies")({
  loader: () => loadStrategyLibrary(),
  component: StrategiesRoute,
})

function StrategiesRoute() {
  const { strategies } = Route.useLoaderData()
  return <StrategyManager initial={strategies} />
}
