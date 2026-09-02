import * as React from "react"
import { Link } from "@tanstack/react-router"
import {
  CandlestickChartIcon,
  SlidersHorizontalIcon,
  TrendingUpIcon,
} from "lucide-react"

import { BacktestGraph } from "@/components/backtest/backtest-graph"
import {
  BacktestMarksLayer,
  type ChartFillMark,
} from "@/components/backtest/backtest-marks-layer"
import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { IndicatorLayer } from "@/components/trade/indicator-layer"
import { MeasureLayer } from "@/components/trade/measure-layer"
import { PaintLayer } from "@/components/trade/paint/paint-layer"
import { PaintToolbar } from "@/components/trade/paint/paint-toolbar"
import { useChartDrawings } from "@/components/trade/paint/use-drawings"
import { PriceChart } from "@/components/trade/price-chart"
import { SmartLadderLayer } from "@/components/trade/smart-ladder-layer"
import { Button } from "@/components/ui/button"
import { ErrorBanner } from "@/components/ui/error-banner"
import type { CandleBar } from "@/lib/protocols/contracts"
import type {
  BacktestRunTrade,
  GraphSeries,
  GraphWindow,
} from "@/lib/trade/backtest/graph"
import { DEFAULT_CHART_OPTIONS } from "@/lib/trade/chart-options"
import type { ChartView } from "@/lib/trade/chart-view"
import type { TradeFlowRunSpec } from "@/lib/trade/flow-run"
import { flowRunIndicatorPaint } from "@/lib/trade/flow-run-indicators"
import type { ChartToolbarPosition } from "@/lib/trade/panel-layout"
import type { SmartLadder } from "@/lib/trade/smart-plan"

/**
 * The middle panel: the **Graph** — this run's money over time — or the
 * **Chart**, one coin's candles with the run's own buys and sells on them.
 *
 * It opens on the Graph, the same way the backtest screen does and for the same
 * reason: "is this working" comes before "what happened on ETH". One button in
 * the header swaps between the two.
 *
 * The graph itself is the backtest's, imported unchanged. Its props are a
 * series, some trades and a starting figure — nothing in it is about testing,
 * and a second copy of a chart that already reads a dragged box correctly would
 * be a second chance to get that wrong.
 *
 * **The candles come from the exchange, not the store.** A backtest draws the
 * bars it walked, because those are what its result was built from; a live run
 * is happening now, and the honest picture is the market as it stands.
 */
export function FlowRunChartPanel({
  spec,
  openCoin,
  coinLabel,
  bars,
  marks,
  ladders,
  graphSeries,
  runTrades,
  window,
  onWindow,
  view,
  onSwapView,
  readView,
  onViewChange,
  loading,
  error,
  walletLabel,
  automationId,
  chartToolbarPosition,
  onChartToolbarPositionChange,
  onRetry,
}: {
  spec: TradeFlowRunSpec
  openCoin: string | null
  coinLabel: string | null
  bars: readonly CandleBar[]
  /** This run's fills on the open coin, already turned into words. */
  marks: readonly ChartFillMark[]
  /**
   * What this run is still working on this coin: the rungs it is waiting to
   * buy at, and the sells resting above the ones that bought.
   *
   * Drawn by the trading screen's own ladder layer, so a rung is the same green
   * dashed line with the same words wherever it is looked at. Read-only here —
   * this page reports, and a × on it would call off a real rung from a record.
   */
  ladders: readonly SmartLadder[]
  graphSeries: GraphSeries | null
  runTrades: readonly BacktestRunTrade[] | null
  window: GraphWindow
  onWindow: (next: GraphWindow) => void
  view: "graph" | "chart"
  onSwapView: () => void
  /** The zoom this chart opens at — the one the trading chart remembers. */
  readView: () => ChartView | null
  onViewChange: (next: ChartView) => void
  loading: boolean
  error: string | null
  /** The wallet's name, for the ladder tag's tooltip. */
  walletLabel: string
  automationId: string
  chartToolbarPosition?: ChartToolbarPosition | null
  onChartToolbarPositionChange?: (position: ChartToolbarPosition | null) => void
  onRetry: () => void
}) {
  const hasGraph = graphSeries !== null && graphSeries.usd.length > 1
  const showGraph = hasGraph && view === "graph"
  // The same drawings and tools as the trading chart, saved against the same
  // market — a line drawn on ETH is a line on ETH whichever screen drew it.
  const paint = useChartDrawings(openCoin)

  // What the run is actually reading the market with, drawn on the chart: the
  // bases a ladder hangs off, the arrows a signals run acts on, or the EMA a
  // Grid run follows. The frozen run settings keep later canvas edits from
  // redrawing what this run used.
  const indicators = React.useMemo(
    () => flowRunIndicatorPaint(spec, bars),
    [bars, spec]
  )

  return (
    <>
      <DashboardCardTitleHeader
        icon={null}
        back={
          hasGraph
            ? {
                onClick: onSwapView,
                label: showGraph
                  ? "Back to the market's chart"
                  : "Back to the graph",
              }
            : { to: "/flow-runs", label: "Back to every run" }
        }
        title={showGraph ? "Graph" : (coinLabel ?? "No market picked")}
        meta={
          showGraph
            ? undefined
            : `${spec.strategy.interval} candles · ${marks.length} ${marks.length === 1 ? "order" : "orders"}`
        }
        action={
          <div className="flex items-center gap-2">
            {hasGraph ? (
              <Button type="button" variant="outline" onClick={onSwapView}>
                {showGraph ? (
                  <>
                    <CandlestickChartIcon className="size-4" />
                    Chart
                  </>
                ) : (
                  <>
                    <TrendingUpIcon className="size-4" />
                    Graph
                  </>
                )}
              </Button>
            ) : null}
            {/* Straight back to the flow this run was switched on from. What is
                running is the copy frozen at the switch, so editing there
                changes nothing here until it is switched off and on again. */}
            <Button asChild type="button" variant="outline">
              <Link
                to="/admin/recipes/$recipeId"
                params={{ recipeId: automationId }}
              >
                <SlidersHorizontalIcon className="size-4" />
                Canvas
              </Link>
            </Button>
          </div>
        }
      />

      <div className="flex min-h-0 flex-1 flex-col">
        {showGraph && graphSeries ? (
          <BacktestGraph
            series={graphSeries}
            trades={runTrades}
            startingUsd={spec.capUsd}
            // A flow never borrows: the live ladder path forces cash-only and a
            // signal trade spends what it was given.
            leverage={1}
            window={window}
            onWindow={onWindow}
          />
        ) : error ? (
          <div className="p-4 sm:p-5">
            <ErrorBanner message={error} onRetry={onRetry} />
          </div>
        ) : !openCoin ? (
          <p className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
            Pick a coin in the panel on the right to see its chart.
          </p>
        ) : loading ? (
          <div
            role="status"
            aria-label="Loading candles"
            className="h-full min-h-0 w-full flex-1 bg-muted/30 motion-safe:animate-pulse motion-reduce:bg-muted/20"
          />
        ) : (
          <div
            key={`${openCoin}:${spec.strategy.interval}`}
            data-slot="chart-ready"
            className="relative min-h-0 flex-1"
          >
            <PriceChart
              candles={[...bars]}
              options={DEFAULT_CHART_OPTIONS}
              viewKey={`${openCoin}:${spec.strategy.interval}`}
              readView={readView}
              onViewChange={onViewChange}
              overlay={(surface, colors) => (
                <>
                  <IndicatorLayer surface={surface} paint={indicators} />
                  {/* Under the arrows: a rung is a price being waited for, and
                      a fill is something that happened. */}
                  <SmartLadderLayer
                    surface={surface}
                    colors={colors}
                    marketKey={openCoin}
                    ladders={ladders}
                    preview={null}
                    tool={paint.tool}
                    readOnly
                    walletName={() => walletLabel}
                  />
                  <BacktestMarksLayer surface={surface} fills={marks} />
                  <PaintLayer
                    surface={surface}
                    drawings={paint.drawings}
                    tool={paint.tool}
                    selectedId={paint.selectedId}
                    onSelect={paint.setSelectedId}
                    onCreate={paint.create}
                    onMove={paint.move}
                    onDelete={paint.remove}
                  />
                  <MeasureLayer
                    key={`${openCoin}:${spec.strategy.interval}`}
                    surface={surface}
                    tool={paint.tool}
                  />
                  <PaintToolbar
                    tool={paint.tool}
                    onPickTool={paint.setTool}
                    drawingCount={paint.drawings.length}
                    drawingsVisible
                    rightInset={surface.axisWidth}
                    savedPosition={chartToolbarPosition}
                    onPositionChange={onChartToolbarPositionChange}
                    onClearAll={() => void paint.clearAll()}
                  />
                </>
              )}
            />
          </div>
        )}
      </div>
    </>
  )
}
