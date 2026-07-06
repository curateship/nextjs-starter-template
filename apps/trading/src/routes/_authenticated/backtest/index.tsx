import { ClientOnly, createFileRoute } from "@tanstack/react-router"
import { z } from "zod"

import { BacktestDashboard } from "@/components/backtest/backtest-dashboard"
import { runDraftSchema } from "@/components/backtest/run-draft"
import { StrategiesOverview } from "@/components/backtest/strategies-dashboard"
import { loadBacktests } from "@/lib/api/backtests"

const backtestSearchSchema = z.object({
  run: z.string().optional(),
  /** A configured-but-not-executed run being tuned on the chart. */
  draft: runDraftSchema.optional(),
})

export const Route = createFileRoute("/_authenticated/backtest/")({
  validateSearch: backtestSearchSchema,
  loader: () => loadBacktests(),
  component: BacktestRoute,
})

/**
 * The Backtest dashboard: without a run or draft it lists the strategies
 * (drill-down into runs and re-run history); with `?run=` it opens the chart
 * workspace for that run; with `?draft=` it opens the workspace in draft mode
 * so price levels can be tuned before the first execution.
 */
function BacktestRoute() {
  const { runs, strategyDefaults } = Route.useLoaderData()
  const { run, draft } = Route.useSearch()
  const navigate = Route.useNavigate()

  if (!run && !draft) {
    return <StrategiesOverview runs={runs} strategyDefaults={strategyDefaults} />
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
        key={run ?? `draft:${draft ? JSON.stringify(draft) : ""}`}
        initialRuns={runs}
        strategyDefaults={strategyDefaults}
        runId={run ?? null}
        draft={draft ?? null}
        onRunIdChange={(id) =>
          void navigate({
            search: (current) => ({
              ...current,
              run: id ?? undefined,
              draft: undefined,
            }),
            replace: true,
          })
        }
        onNewDraft={(nextDraft) =>
          void navigate({ search: { run: undefined, draft: nextDraft } })
        }
        onViewAll={() =>
          void navigate({ search: { run: undefined, draft: undefined } })
        }
      />
    </ClientOnly>
  )
}
