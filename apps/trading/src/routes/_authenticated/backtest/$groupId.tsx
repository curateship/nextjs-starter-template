import { createFileRoute } from "@tanstack/react-router"

import { RunHistoryDashboard } from "@/components/backtest/strategies-dashboard"
import { loadBacktestGroupSummary } from "@/lib/api/backtests"

export const Route = createFileRoute("/_authenticated/backtest/$groupId")({
  loader: async ({ params }) => {
    return loadBacktestGroupSummary(params.groupId)
  },
  component: RunHistoryRoute,
})

function RunHistoryRoute() {
  const { runs, groupMetrics, groupCurve, groupOpenPositions } =
    Route.useLoaderData()
  const { groupId } = Route.useParams()
  return (
    <RunHistoryDashboard
      runs={runs}
      groupId={groupId}
      groupMetrics={groupMetrics}
      groupCurve={groupCurve}
      openPositions={groupOpenPositions}
    />
  )
}
