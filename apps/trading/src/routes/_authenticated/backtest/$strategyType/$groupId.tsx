import { createFileRoute, notFound } from "@tanstack/react-router"

import { RunHistoryDashboard } from "@/components/backtest/strategies-dashboard"
import { loadBacktests, loadGroupMetrics } from "@/lib/api/backtests"
import { STRATEGY_LABELS } from "@/lib/strategies/params"

export const Route = createFileRoute(
  "/_authenticated/backtest/$strategyType/$groupId"
)({
  loader: async ({ params }) => {
    if (
      params.strategyType !== "signal" &&
      !(params.strategyType in STRATEGY_LABELS)
    )
      throw notFound()
    // One group's rows + its blended metrics, fetched in parallel — this
    // page must never pay for the full run catalog.
    const [data, groupMetrics] = await Promise.all([
      loadBacktests({ groupId: params.groupId }),
      loadGroupMetrics([params.groupId]),
    ])
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
      strategyType={strategyType as "signal"}
      groupId={groupId}
      groupMetrics={groupMetrics}
    />
  )
}
