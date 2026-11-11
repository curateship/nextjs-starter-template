import * as React from "react"
import {
  CandlestickChartIcon,
  ChartLineIcon,
  SlidersHorizontalIcon,
  WorkflowIcon,
} from "lucide-react"

import type { BacktestCoinRow, BacktestRunView } from "@/components/backtest/backtest-run-page"
import { BacktestStatsPanel } from "@/components/backtest/backtest-stats-panel"
import { useBacktestFigures } from "@/components/backtest/use-backtest-figures"
import { OpenRunPanel } from "@/components/bots/bots-record"
import { PanelCard } from "@/components/shared/panel-card"
import { Button } from "@/components/ui/button"
import { ErrorRow } from "@/components/ui/error-row"
import { LoadingRow } from "@/components/ui/loading-row"
import { getBacktestErrorMessage, loadBacktest, loadLastBacktestId } from "@/lib/api/trade/backtests"
import type { AutomationGraph } from "@/lib/automations/graph"
import { formatDateTime, formatRelativeTime } from "@/lib/format/format-time"
import { recipeNodeDescription, recipeNodeIcon, recipeNodeName } from "@/lib/recipes/registry"
import { backtestName } from "@/lib/trade/backtest/backtest-name"
import { backtestMeter } from "@/lib/trade/backtest/progress"
import { resultSummary } from "@/lib/trade/backtest/result"

/**
 * An open recipe's right panel while no step is picked: the newest backtest's
 * Result, then what every step on the canvas is set to (Tyler, 11 Nov 2026:
 * "when theres no node selected. Show the panel with the last run result then
 * show a summary of the currant parameter"). Picking a step swaps this for
 * the step's settings, as before.
 */
export function RecipeOverviewPanel({
  recipeId,
  graph,
  onPickStep,
  onOpenBacktest,
}: {
  recipeId: string
  graph: AutomationGraph
  onPickStep: (nodeId: string) => void
  /** Opens a backtest's chart and graph. */
  onOpenBacktest: (runId: string) => void
}) {
  const last = useLastBacktest(recipeId)
  // Left to right, the way the canvas reads: Wallet, Markets, then the rest.
  const steps = [...graph.nodes].sort((one, two) => one.x - two.x || one.y - two.y)

  return (
    <OpenRunPanel title="Recipe" icon={WorkflowIcon} menu={null} hideLabel="Hide the recipe">
      <PanelCard
        storageId="recipe-last-result"
        icon={<ChartLineIcon />}
        title="Last result"
      >
        {last.state === "loading" ? (
          <LoadingRow label="Loading the last backtest" />
        ) : last.state === "error" ? (
          <ErrorRow message={last.message} onRetry={last.retry} />
        ) : last.state === "none" ? (
          <p className="text-sm text-muted-foreground">No backtest yet. Press Backtest above the canvas to run one.</p>
        ) : (
          <div className="grid gap-4">
            <p className="grid gap-0.5">
              <span className="truncate text-sm font-medium">{backtestName(last.run)}</span>
              <span className="text-xs text-muted-foreground">
                {formatRelativeTime(new Date(last.run.createdAt), formatDateTime)}
              </span>
            </p>
            <LastResultFigures run={last.run} coins={last.coins} />
            <Button type="button" variant="outline" onClick={() => onOpenBacktest(last.run.id)}>
              <CandlestickChartIcon className="size-4" />
              Open chart
            </Button>
          </div>
        )}
      </PanelCard>
      <PanelCard storageId="recipe-parameters" icon={<SlidersHorizontalIcon />} title="Parameters">
        {steps.length === 0 ? (
          <p className="text-sm text-muted-foreground">No steps yet. Add them from the list on the left.</p>
        ) : (
          <ul className="-mx-2 grid gap-1">
            {steps.map((node) => {
              const Icon = recipeNodeIcon(node)
              return (
                <li key={node.id}>
                  <button
                    type="button"
                    data-recipe-parameter=""
                    className="grid w-full grid-cols-[auto_minmax(0,1fr)] gap-x-2.5 rounded-md px-2 py-2 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                    onClick={() => onPickStep(node.id)}
                  >
                    <Icon className="mt-0.5 size-4 text-muted-foreground" aria-hidden />
                    <span className="grid gap-0.5">
                      <span className="text-sm font-semibold">{recipeNodeName(node)}</span>
                      <span className="text-[13px] leading-5 text-foreground/75">{recipeNodeDescription(node)}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </PanelCard>
    </OpenRunPanel>
  )
}

/** The Result card's figures, as a picked line in the Backtests table shows them. */
function LastResultFigures({ run, coins }: { run: BacktestRunView; coins: BacktestCoinRow[] }) {
  const { window, graphStats } = useBacktestFigures(run)
  const meter = backtestMeter(coins)
  return (
    <BacktestStatsPanel
      summary={resultSummary(run.summary)}
      result={run.result}
      spec={run.spec}
      stats={graphStats}
      window={window}
      coinsTotal={coins.length}
      progress={meter.value}
      progressText={meter.text}
      running={run.finishedAt === null}
    />
  )
}

type LastBacktest =
  | { state: "loading" }
  | { state: "none" }
  | { state: "error"; message: string; retry: () => void }
  | { state: "ready"; run: BacktestRunView & { coinsTotal: number }; coins: BacktestCoinRow[] }

/**
 * The recipe's newest backtest, read again every few seconds while it is still
 * running, so a backtest started from the canvas fills in here as it goes.
 */
function useLastBacktest(recipeId: string): LastBacktest {
  const [answer, setAnswer] = React.useState<LastBacktest>({ state: "loading" })
  const [attempt, setAttempt] = React.useState(0)
  const running = answer.state === "ready" && answer.run.finishedAt === null

  React.useEffect(() => {
    let live = true
    const read = async () => {
      try {
        const { id } = await loadLastBacktestId(recipeId)
        if (!id) {
          if (live) setAnswer({ state: "none" })
          return
        }
        const opened = await loadBacktest(id)
        if (live) {
          setAnswer({
            state: "ready",
            run: { ...opened.run, coinsTotal: opened.coins.length },
            coins: opened.coins as BacktestCoinRow[],
          })
        }
      } catch (error) {
        if (live) {
          setAnswer({
            state: "error",
            message: getBacktestErrorMessage(error),
            retry: () => setAttempt((count) => count + 1),
          })
        }
      }
    }
    void read()
    const timer = running ? window.setInterval(() => void read(), 5_000) : undefined
    return () => {
      live = false
      window.clearInterval(timer)
    }
  }, [recipeId, attempt, running])

  return answer
}
