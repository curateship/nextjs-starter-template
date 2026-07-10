import { ClientOnly, createFileRoute } from "@tanstack/react-router"
import { z } from "zod"

import { BacktestDashboard } from "@/components/backtest/backtest-dashboard"
import { StrategiesOverview } from "@/components/backtest/strategies-dashboard"
import { loadBacktests } from "@/lib/api/backtests"

const backtestSearchSchema = z.object({
  run: z.string().optional(),
})

export const Route = createFileRoute("/_authenticated/backtest/")({
  validateSearch: backtestSearchSchema,
  loader: () => loadBacktests(),
  component: BacktestRoute,
})

/**
 * The Backtest dashboard: without a run it lists the strategies (drill-down
 * into runs and re-run history); with `?run=` it opens the chart workspace
 * for that run.
 */
function BacktestRoute() {
  const { runs } = Route.useLoaderData()
  const { run } = Route.useSearch()
  const navigate = Route.useNavigate()

  if (!run) {
    return <StrategiesOverview runs={runs} />
  }

  return (
    <ClientOnly
      fallback={
        <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
          Loading backtest workspace…
        </div>
      }
    >
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
