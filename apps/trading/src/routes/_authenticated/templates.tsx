import { createFileRoute } from "@tanstack/react-router"

import { StrategyManager } from "@/components/strategies/strategy-manager"
import { loadStrategies } from "@/lib/api/strategies"

/**
 * The strategies library (new model) — this route replaced the old run
 * templates page: a strategy is one indicator + one settings block, and bots
 * pick from this list.
 */
export const Route = createFileRoute("/_authenticated/templates")({
  loader: () => loadStrategies(),
  component: StrategiesRoute,
})

function StrategiesRoute() {
  const { strategies } = Route.useLoaderData()
  return <StrategyManager initial={strategies} />
}
