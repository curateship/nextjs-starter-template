import * as React from "react"

import { loadBacktestRunTrades } from "@/lib/api/trade/backtests"
import {
  buildGraphSeries,
  graphView,
  windowStats,
  WHOLE_RUN,
  type BacktestRunTrade,
  type GraphWindow,
} from "@/lib/trade/backtest/graph"
import type { BacktestRunView } from "@/components/backtest/backtest-run-page"

/**
 * What a backtest's Result card counts from: the run's every trade, its pot as
 * a line, and the figures for the stretch picked. One copy for the opened
 * backtest and for a line picked in the Backtests table, so the two never
 * answer differently.
 */
export function useBacktestFigures(run: BacktestRunView) {
  // How much the run borrows. The pot's line records the MARGIN each position
  // put up, not what it bought, so at 2× the money in the market is twice the
  // saved figure — and reading it straight said $529 where $1,058 was at work.
  // A signals run does not borrow, so it stands at 1.
  const leverage =
    run.spec.strategy.kind === "dca"
      ? run.spec.strategy.params.leverage
      : run.spec.strategy.kind === "emaGrid"
        ? run.spec.strategy.settings.grid.leverage
        : 1

  // Which stretch of the run every figure is answering for, shared by the
  // graph and the Result card.
  const [window, setWindow] = React.useState<GraphWindow>(WHOLE_RUN)

  // Every round trip the run made, in one request. Carries the run it answers,
  // so a second run never counts the first one's trades while its own load.
  const [runTrades, setRunTrades] = React.useState<{
    runId: string
    trades: BacktestRunTrade[]
  } | null>(null)
  React.useEffect(() => {
    let live = true
    void loadBacktestRunTrades(run.id)
      .then((answer) => {
        if (live) setRunTrades({ runId: run.id, trades: answer.trades })
      })
      .catch(() => {
        // A run whose trades will not load still has a pot to draw and a
        // summary to read; those tiles show a dash.
        if (live) setRunTrades(null)
      })
    return () => {
      live = false
    }
  }, [run.id])
  const trades = runTrades?.runId === run.id ? runTrades.trades : null

  const graphSeries = React.useMemo(() => {
    if (!run.result || run.result.equity.length < 2) return null
    return buildGraphSeries(run.result.equity, run.result.inPlay, trades, run.spec.startingUsd)
  }, [run.result, run.spec.startingUsd, trades])

  const graphStats = React.useMemo(() => {
    if (!graphSeries) return null
    const { stats } = graphView(graphSeries, window)
    // The same borrowing the graph's own reading uses.
    return windowStats(graphSeries, trades, stats[0], stats[1], run.spec.startingUsd, leverage)
  }, [graphSeries, trades, window, run.spec.startingUsd, leverage])

  return { leverage, window, setWindow, trades, graphSeries, graphStats }
}
