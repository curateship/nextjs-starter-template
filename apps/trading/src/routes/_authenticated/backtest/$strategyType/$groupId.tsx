import { createFileRoute, notFound } from "@tanstack/react-router"

import { RunHistoryDashboard } from "@/components/backtest/strategies-dashboard"
import { loadBacktests, loadGroupMetrics } from "@/lib/api/backtests"
import { indicatorIdSchema, type IndicatorId } from "@/lib/indicators/registry"

export const Route = createFileRoute(
  "/_authenticated/backtest/$strategyType/$groupId"
)({
  loader: async ({ params }) => {
    // The $strategyType param is an indicator id (e.g. "qqe", "ema_cross").
    if (!indicatorIdSchema.safeParse(params.strategyType).success)
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
      strategyType={strategyType as IndicatorId}
      groupId={groupId}
      groupMetrics={groupMetrics}
    />
  )
}
