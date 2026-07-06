import { createFileRoute, notFound } from "@tanstack/react-router"

import { StrategyRunsDashboard } from "@/components/backtest/strategies-dashboard"
import { loadBacktests } from "@/lib/api/backtests"
import { STRATEGY_LABELS, type StrategyType } from "@/lib/strategies/params"

export const Route = createFileRoute("/_authenticated/backtest/$strategyType/")({
  loader: async ({ params }) => {
    if (!(params.strategyType in STRATEGY_LABELS)) throw notFound()
    return loadBacktests()
  },
  component: StrategyRunsRoute,
})

function StrategyRunsRoute() {
  const { runs, strategyDefaults } = Route.useLoaderData()
  const { strategyType } = Route.useParams()
  return (
    <StrategyRunsDashboard
      runs={runs}
      strategyType={strategyType as StrategyType}
      strategyDefaults={strategyDefaults}
    />
  )
}
