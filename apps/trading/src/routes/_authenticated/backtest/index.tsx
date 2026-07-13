import { ClientOnly, createFileRoute } from "@tanstack/react-router"
import { z } from "zod"

import { BacktestDashboard } from "@/components/backtest/backtest-dashboard"
import { RunGroupsDashboard } from "@/components/backtest/strategies-dashboard"
import {
  WorkspaceLoadBoundary,
  WorkspaceLoadingSkeleton,
} from "@/components/loading-skeleton"
import { loadBacktests, loadGroupMetrics } from "@/lib/api/backtests"

const backtestSearchSchema = z.object({
  run: z.string().optional(),
})

export const Route = createFileRoute("/_authenticated/backtest/")({
  validateSearch: backtestSearchSchema,
  loader: async () => {
    const data = await loadBacktests()
    // Blended per-group metrics for the run list (the API caps one metrics
    // request at 100 groups; beyond that the DD/Bucket cells just stay empty).
    const groupIds = [...new Set(data.runs.map((run) => run.groupId))]
    const groupMetrics = await loadGroupMetrics(groupIds.slice(0, 100))
    return { ...data, groupMetrics }
  },
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
    <ClientOnly fallback={<WorkspaceLoadingSkeleton />}>
      <WorkspaceLoadBoundary>
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
      </WorkspaceLoadBoundary>
    </ClientOnly>
  )
}
