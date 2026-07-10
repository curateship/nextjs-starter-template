import { createFileRoute, notFound } from "@tanstack/react-router"
import { z } from "zod"

import { StrategyRunsDashboard } from "@/components/backtest/strategies-dashboard"
import { loadBacktests, loadGroupMetrics } from "@/lib/api/backtests"
import { indicatorIdSchema, type IndicatorId } from "@/lib/indicators/registry"

const strategyRunsSearchSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
})

export const Route = createFileRoute("/_authenticated/backtest/$strategyType/")({
  validateSearch: (search) => strategyRunsSearchSchema.parse(search),
  loaderDeps: ({ search }) => search,
  loader: async ({ params, deps }) => {
    // The $strategyType param is an indicator id (e.g. "qqe", "ema_cross").
    const indicator = indicatorIdSchema.safeParse(params.strategyType)
    if (!indicator.success) throw notFound()
    const data = await loadBacktests({
      indicatorType: indicator.data,
      page: deps.page ?? 1,
      pageSize: deps.pageSize ?? 20,
    })
    const groupIds = [...new Set(data.runs.map((run) => run.groupId))]
    const groupMetrics = await loadGroupMetrics(groupIds)
    return { ...data, groupMetrics }
  },
  component: StrategyRunsRoute,
})

function StrategyRunsRoute() {
  const { runs, pagination, groupMetrics } = Route.useLoaderData()
  const { strategyType } = Route.useParams()
  const navigate = Route.useNavigate()
  return (
    <StrategyRunsDashboard
      runs={runs}
      strategyType={strategyType as IndicatorId}
      pagination={pagination}
      groupMetrics={groupMetrics}
      onPaginationChange={(patch) =>
        void navigate({
          search: (current) => ({ ...current, ...patch }),
          replace: true,
        })
      }
    />
  )
}
