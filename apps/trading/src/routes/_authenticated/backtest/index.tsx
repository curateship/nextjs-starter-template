import { ClientOnly, createFileRoute } from "@tanstack/react-router"
import { z } from "zod"

import { BacktestDashboard } from "@/components/backtest/backtest-dashboard"
import { RunGroupsDashboard } from "@/components/backtest/strategies-dashboard"
import { loadBacktestOverview } from "@/lib/api/backtests"

const backtestSearchSchema = z.object({
  run: z.string().optional(),
})

export const Route = createFileRoute("/_authenticated/backtest/")({
  validateSearch: backtestSearchSchema,
  loader: () => loadBacktestOverview(),
  component: BacktestRoute,
})

/**
 * The Backtest dashboard: without a run it lists the run groups directly
 * (every run comes from an Automation, so there is no strategy-type level);
 * with `?run=` it opens the chart workspace for that run.
 */
function BacktestRoute() {
  const { runs, groupMetrics } = Route.useLoaderData()
  const { run } = Route.useSearch()
  const navigate = Route.useNavigate()

  if (!run) {
    return <RunGroupsDashboard runs={runs} groupMetrics={groupMetrics} />
  }

  return (
    <ClientOnly fallback={null}>
      <BacktestDashboard
        key={run}
        initialRuns={runs}
        runId={run}
        onRunIdChange={(id) =>
          void navigate({
            search: (current) => ({ ...current, run: id ?? undefined }),
            replace: true,
          })
        }
        onViewAll={() => void navigate({ search: { run: undefined } })}
      />
    </ClientOnly>
  )
}
