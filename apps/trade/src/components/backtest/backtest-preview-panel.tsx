import {
  CandlestickChartIcon,
  ChartLineIcon,
  FlaskConicalIcon,
} from "lucide-react"

import type { BacktestCoinRow, BacktestRunView } from "@/components/backtest/backtest-run-page"
import { BacktestStatsPanel } from "@/components/backtest/backtest-stats-panel"
import { useBacktestFigures } from "@/components/backtest/use-backtest-figures"
import { OpenRunPanel } from "@/components/bots/bots-record"
import { FooterState } from "@/components/crm/record-frame"
import { PanelCard } from "@/components/shared/panel-card"
import { Button } from "@/components/ui/button"
import { backtestMeter } from "@/lib/trade/backtest/progress"
import { resultSummary } from "@/lib/trade/backtest/result"

/**
 * A line picked in the Backtests table: its Result card on the right, and
 * Open chart in the footer, which opens its chart and graph in the middle
 * (Tyler, 10 Nov 2026: "clicking on the table item should open up the right
 * panel to show the results and in the footer have a button to click on to
 * show the chart and graph").
 */
export function BacktestPreviewPanel({
  run,
  coins,
  menu,
  onOpen,
}: {
  run: BacktestRunView
  coins: BacktestCoinRow[]
  /** The backtest's ⋮. */
  menu: React.ReactNode
  /** Opens the chart and graph in the middle. */
  onOpen: () => void
}) {
  const { window, graphStats } = useBacktestFigures(run)
  const done = run.finishedAt !== null
  const meter = backtestMeter(coins)
  return (
    <OpenRunPanel
      title="Backtest"
      icon={FlaskConicalIcon}
      menu={menu}
      hideLabel="Hide the backtest"
      footer={
        <>
          <FooterState>{done ? "Finished" : run.stopRequested ? "Stopping" : "Running"}</FooterState>
          <Button type="button" onClick={onOpen}>
            <CandlestickChartIcon className="size-4" />
            Open chart
          </Button>
        </>
      }
    >
      <PanelCard storageId="backtest-result" icon={<ChartLineIcon />} title="Result">
        <BacktestStatsPanel
          summary={resultSummary(run.summary)}
          result={run.result}
          spec={run.spec}
          stats={graphStats}
          window={window}
          coinsTotal={coins.length}
          progress={meter.value}
          progressText={meter.text}
          running={!done}
        />
      </PanelCard>
    </OpenRunPanel>
  )
}
