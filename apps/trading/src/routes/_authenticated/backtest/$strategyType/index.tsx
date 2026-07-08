import { createFileRoute, notFound } from "@tanstack/react-router"
import { z } from "zod"

import { StrategyRunsDashboard } from "@/components/backtest/strategies-dashboard"
import { loadBacktests } from "@/lib/api/backtests"
import { STRATEGY_LABELS, type StrategyType } from "@/lib/strategies/params"

const strategyRunsSearchSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
})

export const Route = createFileRoute("/_authenticated/backtest/$strategyType/")({
  validateSearch: (search) => strategyRunsSearchSchema.parse(search),
  loaderDeps: ({ search }) => search,
  loader: async ({ params, deps }) => {
    if (!(params.strategyType in STRATEGY_LABELS)) throw notFound()
    return loadBacktests({
      strategyType: params.strategyType as StrategyType,
      page: deps.page ?? 1,
      pageSize: deps.pageSize ?? 20,
    })
  },
  component: StrategyRunsRoute,
})

function StrategyRunsRoute() {
  const { runs, strategyDefaults, templates, pagination } = Route.useLoaderData()
  const { strategyType } = Route.useParams()
  const navigate = Route.useNavigate()
  return (
    <StrategyRunsDashboard
      runs={runs}
      strategyType={strategyType as StrategyType}
      strategyDefaults={strategyDefaults}
      templates={templates}
      pagination={pagination}
      onPaginationChange={(patch) =>
        void navigate({
          search: (current) => ({ ...current, ...patch }),
          replace: true,
        })
      }
    />
  )
}
