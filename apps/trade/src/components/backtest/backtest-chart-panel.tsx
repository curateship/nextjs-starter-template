
import * as React from "react"
import { Link } from "@tanstack/react-router"
import {
  ChevronLeftIcon,
  SlidersHorizontalIcon,
} from "lucide-react"

import { BacktestFocusLayer } from "@/components/backtest/backtest-focus-layer"
import { BacktestMarksLayer } from "@/components/backtest/backtest-marks-layer"
import { WorkspacePanelHeader } from "@/components/shared/workspace-panel-header"
import { IndicatorLayer } from "@/components/trade/indicator-layer"
import { MeasureLayer } from "@/components/trade/measure-layer"
import { PaintLayer } from "@/components/trade/paint/paint-layer"
import { PaintToolbar } from "@/components/trade/paint/paint-toolbar"
import { useChartDrawings } from "@/components/trade/paint/use-drawings"
import { PriceChart } from "@/components/trade/price-chart"
import { Button } from "@/components/ui/button"
import { ErrorBanner } from "@/components/ui/error-banner"
import type { CandleBar } from "@/lib/protocols/contracts"
import type { BacktestSpecSnapshot } from "@/lib/trade/backtest/result"
import type {
  BacktestFillMark,
  BacktestTrade,
} from "@/lib/trade/backtest/result"
import {
  DEFAULT_MARGIN_BOTTOM,
  DEFAULT_MARGIN_TOP,
  type ChartView,
} from "@/lib/trade/chart-view"
import { focusRing } from "@/lib/layout/focus-ring"
import { cn } from "@/lib/utils"
import { DEFAULT_CHART_OPTIONS } from "@/lib/trade/chart-options"
import { baseDashes } from "@/lib/trade/indicators/base"
import { indicatorPaint } from "@/lib/trade/indicators/registry"

import type { BacktestCoinRow } from "./backtest-run-page"

/**
 * The middle panel: one coin's candles with the run's buys and sells on them.
 *
 * The candles come from the store rather than the exchange, so what is drawn is
 * exactly what the run walked — asking the exchange again could answer with a
 * revised bar and put a mark where the trade never happened.
 *
 * The marks are a layer over the chart, the same idiom the indicators use.
 * `price-chart.tsx` is not edited to make this work: it is handed a function
 * and a surface, and has never heard the word "backtest".
 */
export function BacktestChartPanel({
  coins,
  openCoin,
  bars,
  fills,
  trades,
  focusTrade,
  spec,
  interval,
  loading,
  error,
  live,
  automationId,
  onRetry,
}: {
  coins: readonly BacktestCoinRow[]
  openCoin: string | null
  bars: readonly CandleBar[]
  fills: readonly BacktestFillMark[]
  /** Every round trip on this coin — where the picked trade's ladder-mates are found. */
  trades: readonly BacktestTrade[]
  /** The trade picked in the list below, joined up on the chart. */
  focusTrade: BacktestTrade | null
  /** The run's own settings — what a base is, for this run. */
  spec: BacktestSpecSnapshot
  interval: string
  loading: boolean
  error: string | null
  /** The run has not finished, so more marks may still appear. */
  live: boolean
  /** The flow this run came from — where the back arrow goes. */
  automationId: string
  onRetry: () => void
}) {
  const chartable = coins.filter((coin) => coin.summary)
  // The same drawings, tools and ruler as the trading chart, saved against the
  // same market key — a line drawn on ETH while reading a backtest is still a
  // line on ETH, and having two sets of them per market would be two answers to
  // one question.
  const paint = useChartDrawings(openCoin)

  // The base levels, always on.
  //
  // Not a switch, on purpose: the whole strategy hangs off the base — a ladder
  // arms when one is confirmed and its stop rests under it — so a backtest
  // chart without them is a chart of the trades with the reason for them left
  // out. The trading chart's own indicator menu is a place to browse; this one
  // is a place to check working, and there is only one thing to check it
  // against.
  //
  // **The run's own settings, and only the levels it actually used.**
  //
  // Both halves of that were wrong. It drew with the indicator's factory
  // numbers, so changing the step changed the run and not the picture; and it
  // drew the indicator's dashes, which mark EVERY level that ever confirmed —
  // deliberately so on the trading chart, where the spacing rule is documented
  // as never hiding a dash. Here that meant a chart covered in levels the run
  // had ignored, and no way to tell which one a trade actually hung off.
  //
  // So this draws a short dash at each base the ladder actually anchored to,
  // in the same shape the trading chart uses. Nothing here is a level the run
  // did not use, and nothing here is a line drawn across the chart.
  const indicators = React.useMemo(() => {
    // A signals run is the other way round: there its arrows ARE the orders,
    // so drawing them says exactly what the run acted on. The dashes are the
    // ladder's business and would mean nothing here.
    if (spec.strategy.kind === "signals") {
      return indicatorPaint(spec.strategy.indicators, [...bars])
    }
    return {
      dashes: baseDashes([...bars], spec.strategy.params.baseDetection),
      // No arrows. The base draws one at each candle that confirmed a level,
      // and on this chart that reads as an order — which is exactly what the
      // arrows beside it already are. Two different things in one shape is
      // worse than one of them being missing.
      marks: [],
    }
  }, [bars, spec])

  /**
   * Where the chart sits when a trade is picked: zoomed to that round trip,
   * with room either side to see what price did around it.
   *
   * A dotted line joining two points is no use if both are off screen — a
   * ninety-day chart is a thousand candles wide and one trade is four of them.
   * So picking a row moves the chart to it, and picking it again puts the whole
   * run back.
   *
   * Measured in candles rather than time, because that is what a view is:
   * `bars` is how many fit across, `gap` is how far behind the newest one the
   * right edge sits. The bar length comes off the candles themselves, so no
   * timeframe has to be written down twice.
   */
  // Off the candles themselves, so no timeframe is written down twice.
  const barMs = bars.length > 1 ? bars[1].openTime - bars[0].openTime : 0

  // The picked trade AND every other rung its exit closed. A sell that took
  // out three rungs is three round trips sharing one exit arrow, and picking
  // any of them is picking the same event — so all of them get their dotted
  // line, and the zoom below reaches back to the earliest of their buys.
  const focusTrades = React.useMemo<readonly BacktestTrade[]>(() => {
    if (!focusTrade) return []
    if (focusTrade.exitAt === null) return [focusTrade]
    return trades.filter(
      (trade) =>
        trade.exitAt === focusTrade.exitAt && trade.exitPx === focusTrade.exitPx
    )
  }, [focusTrade, trades])

  const focusView = React.useMemo<ChartView | null>(() => {
    if (!focusTrade || !(barMs > 0)) return null

    const newest = bars[bars.length - 1].openTime
    const endsAt = focusTrade.exitAt ?? newest
    const startsAt = Math.min(
      ...focusTrades.map((trade) => trade.entryAt),
      focusTrade.entryAt
    )
    const spanBars = Math.max(1, (endsAt - startsAt) / barMs)
    // Room either side, and never so tight that a four-candle trade fills the
    // screen — the point is to see the trade IN its market, not on its own.
    const pad = Math.max(10, spanBars * 0.75)
    return {
      bars: Math.round(spanBars + pad * 2),
      gap: Math.round((newest - endsAt) / barMs - pad),
      marginTop: DEFAULT_MARGIN_TOP,
      marginBottom: DEFAULT_MARGIN_BOTTOM,
    }
  }, [focusTrade, focusTrades, bars, barMs])

  return (
    <>
      <WorkspacePanelHeader
        // Back to the canvas this run came from, in the panel's own icon slot.
        // The one place anybody wants to go from a result is the flow that
        // produced it, so it is the first thing on the row rather than a
        // separate strip above the panels.
        icon={
          <Link
            to="/backtests"
            aria-label="Back to every backtest"
            // Pulled out by a quarter on each side. The header's icon slot is
            // 16px and this target is 24px, so without the negative margin the
            // hover box grew out of its slot and sat off-centre against the
            // title beside it.
            className={cn(
              "-m-1 flex size-6 items-center justify-center rounded-md hover:bg-muted hover:text-foreground",
              focusRing
            )}
          >
            <ChevronLeftIcon className="size-4" />
          </Link>
        }
        title={
          coins.find((coin) => coin.marketKey === openCoin)?.symbol ??
          "No coin picked"
        }
        meta={`${interval} candles · ${fills.length} ${fills.length === 1 ? "order" : "orders"}`}
        action={
          <div className="flex items-center gap-2">
            {/* Straight back to the settings this run was made from, with
                the ladder step already chosen. Picking a coin lives in the
                Coins tab below, where the whole list is; a dropdown up here
                was a second way to do the same thing, from a shorter list. */}
            <Button asChild type="button" variant="outline">
              <Link
                to="/admin/automations/$automationId"
                params={{ automationId }}
                search={{ node: "tradeDca" }}
              >
                <SlidersHorizontalIcon className="size-4" />
                Parameter settings
              </Link>
            </Button>
          </div>
        }
      />

      {live ? (
        <div className="shrink-0 border-b bg-amber-500/10 px-4 py-2 text-xs text-amber-700 sm:px-5 dark:text-amber-400">
          This run is still going, so more marks may appear on this chart.
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col">
        {error ? (
          <div className="p-4 sm:p-5">
            <ErrorBanner message={error} onRetry={onRetry} />
          </div>
        ) : !openCoin ? (
          <p className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
            {chartable.length === 0
              ? "No coin was tested, so there is nothing to chart."
              : "Pick a coin above, or click a row in the Coins tab below."}
          </p>
        ) : loading ? (
          <div
            role="status"
            aria-label="Loading candles"
            className="h-full min-h-0 w-full flex-1 bg-muted/30 motion-safe:animate-pulse motion-reduce:bg-muted/20"
          />
        ) : (
          <div
            key={`${openCoin}:${interval}`}
            data-slot="chart-ready"
            className="relative min-h-0 flex-1 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-300"
          >
            <PriceChart
              candles={[...bars]}
              options={DEFAULT_CHART_OPTIONS}
              // The picked trade is part of the key: changing it re-frames the
              // chart, which is what moves it to the trade and back again.
              viewKey={`${openCoin}:${interval}:${focusTrade?.n ?? "all"}`}
              readView={() => focusView}
              overlay={(surface) => (
                <>
                  {/* First, so everything else sits over it. The base is the
                      chart's own reading of the candles; an order the run
                      placed is something that happened, and that should never
                      end up behind a dash. */}
                  <IndicatorLayer surface={surface} paint={indicators} />
                  <BacktestMarksLayer surface={surface} fills={fills} />
                  {/* Over the arrows: a picked trade is what you are looking
                      at, and its box has to be readable through them. */}
                  <BacktestFocusLayer
                    surface={surface}
                    trades={trades}
                    focus={focusTrades}
                  />
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
                  {/* Last, so while Shift is held its sheet is over everything
                      and a drag across an arrow measures rather than being
                      swallowed by it. Keyed on the coin, because a reading
                      belongs to the candles it was taken on. */}
                  <MeasureLayer
                    key={`${openCoin}:${interval}`}
                    surface={surface}
                    tool={paint.tool}
                  />
                </>
              )}
            />
            <PaintToolbar
              tool={paint.tool}
              onPickTool={paint.setTool}
              drawingCount={paint.drawings.length}
              onClearAll={() => void paint.clearAll()}
            />
          </div>
        )}
      </div>
    </>
  )
}
