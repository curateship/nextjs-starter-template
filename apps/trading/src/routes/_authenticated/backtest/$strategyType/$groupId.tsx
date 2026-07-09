import { createFileRoute, notFound } from "@tanstack/react-router"

import { RunHistoryDashboard } from "@/components/backtest/strategies-dashboard"
import { loadBacktests, loadGroupMetrics } from "@/lib/api/backtests"
import { STRATEGY_LABELS, type StrategyType } from "@/lib/strategies/params"

export const Route = createFileRoute(
  "/_authenticated/backtest/$strategyType/$groupId"
)({
  loader: async ({ params }) => {
    if (!(params.strategyType in STRATEGY_LABELS)) throw notFound()
    const data = await loadBacktests()
    const groupMetrics = await loadGroupMetrics([params.groupId])
    return { ...data, groupMetrics }
  },
  component: RunHistoryRoute,
})

function RunHistoryRoute() {
  const { runs, groupMetrics } = Route.useLoaderData()
  const { strategyType, groupId } = Route.useParams()
  return (
    <RunHistoryDashboard
      runs={runs}
      strategyType={strategyType as StrategyType}
      groupId={groupId}
      groupMetrics={groupMetrics}
    />
  )
}
