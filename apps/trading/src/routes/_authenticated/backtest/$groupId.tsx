import { createFileRoute } from "@tanstack/react-router"

import { RunHistoryDashboard } from "@/components/backtest/strategies-dashboard"
import {
  loadBacktests,
  loadGroupCurve,
  loadGroupMetrics,
} from "@/lib/api/backtests"

export const Route = createFileRoute("/_authenticated/backtest/$groupId")({
  loader: async ({ params }) => {
    // One group's rows, its blended metrics, and its combined P&L curve,
    // fetched in parallel — this page must never pay for the full run catalog.
    const [data, groupMetrics, groupCurve] = await Promise.all([
      loadBacktests({ groupId: params.groupId }),
      loadGroupMetrics([params.groupId]),
      loadGroupCurve(params.groupId),
    ])
    return { ...data, groupMetrics, groupCurve }
  },
  component: RunHistoryRoute,
})

function RunHistoryRoute() {
  const { runs, groupMetrics, groupCurve } = Route.useLoaderData()
  const { groupId } = Route.useParams()
  return (
    <RunHistoryDashboard
      runs={runs}
      groupId={groupId}
      groupMetrics={groupMetrics}
      groupCurve={groupCurve}
    />
  )
}
