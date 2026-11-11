import * as React from "react"

import { signedUsd, toneClass } from "@/components/backtest/backtest-kpi"
import { ErrorRow } from "@/components/ui/error-row"
import { LoadingRow } from "@/components/ui/loading-row"
import { getBacktestErrorMessage, loadBacktests } from "@/lib/api/trade/backtests"
import { formatDateTime, formatRelativeTime } from "@/lib/format/format-time"
import { backtestName } from "@/lib/trade/backtest/backtest-name"
import type { BacktestListRow } from "@/lib/trade/backtest/result"
import { cn } from "@/lib/utils"

/**
 * The recipe ⋮'s Saved results tab: every backtest this recipe has, newest
 * first, each with what it made or lost and when it ran (Tyler, 11 Nov 2026:
 * "Add another tab here called "Saved results" this tab shows all the
 * backtest results saved from this recipe"). Pressing one opens its chart.
 * Read when the tab is opened, so the menu itself opens at once.
 */
export function RecipeSavedResults({
  recipeId,
  onOpen,
}: {
  recipeId: string
  onOpen: (runId: string) => void
}) {
  const [runs, setRuns] = React.useState<BacktestListRow[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [attempt, setAttempt] = React.useState(0)

  React.useEffect(() => {
    let live = true
    loadBacktests({ automationId: recipeId }).then(
      (answer) => {
        if (!live) return
        setError(null)
        setRuns([...answer.runs].sort((one, two) => two.createdAt - one.createdAt))
      },
      (reason: unknown) => {
        if (live) setError(getBacktestErrorMessage(reason))
      }
    )
    return () => {
      live = false
    }
  }, [recipeId, attempt])

  if (error) return <ErrorRow message={error} onRetry={() => setAttempt((count) => count + 1)} />
  if (!runs) return <LoadingRow label="Loading saved results" />
  if (runs.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-sm text-muted-foreground">
        No backtests yet. Press Backtest above the canvas to run one.
      </p>
    )
  }

  return (
    <ul className="grid max-h-80 overflow-y-auto p-1.5">
      {runs.map((run) => {
        const made = run.summary?.madeOrLost
        return (
          <li key={run.id}>
            <button
              type="button"
              data-saved-result=""
              className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 rounded-md px-2.5 py-2 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
              onClick={() => onOpen(run.id)}
            >
              <span className="truncate text-sm font-medium">{backtestName(run)}</span>
              <span className={cn("text-sm font-semibold tabular-nums", toneClass(made))}>
                {made === undefined ? (run.finishedAt === null ? "Running" : "None") : signedUsd(made)}
              </span>
              <span className="col-span-2 text-xs text-muted-foreground">
                {formatRelativeTime(new Date(run.createdAt), formatDateTime)}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
