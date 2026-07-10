import type {
  ChartBarColor,
  ChartMarker,
  ChartOverlayLine,
  ChartPriceLine,
  ChartZone,
} from "@/components/chart/price-chart"
import type { BacktestResult } from "@/lib/backtest/types"
import type { IndicatorConfig } from "@/lib/trading/indicators-config"

/** Trade chips read by open/close, not buy/sell: green "O" opens, red "C" closes. */
const OPEN_COLOR = "#089981"
const CLOSE_COLOR = "#f23645"

export type StrategyChartOverlays = {
  /** Rendered through the shared indicator system (theme-aware). */
  indicators: IndicatorConfig[]
  /** Generic line series (breakout channel). */
  overlayLines: ChartOverlayLine[]
  /** Grid levels / TP / SL / DCA ladder. */
  priceLines: ChartPriceLine[]
  /** Filled rectangles (QQE consolidation zones). */
  zones: ChartZone[]
  /** Per-bar candle recoloring (QQE state). */
  barColors: ChartBarColor[]
  /**
   * Raw indicator signals (TradingView-style Buy/Sell labels), independent of
   * position state — fills only mark actual trades, so e.g. repeat sell
   * signals while already short would otherwise be invisible.
   */
  markers: ChartMarker[]
}

/** Price-pinned "O" (open) / "C" (close) chips for each round trip, plus any
 * still-open position's entry. Letters read by open/close, not buy/sell. */
export function buildRunMarkers(result: BacktestResult): ChartMarker[] {
  const markers: ChartMarker[] = []
  const open = (time: number, side: "buy" | "sell", price: number): ChartMarker => ({
    time,
    side,
    price,
    letter: "O",
    color: OPEN_COLOR,
  })
  const close = (time: number, side: "buy" | "sell", price: number): ChartMarker => ({
    time,
    side,
    price,
    letter: "C",
    color: CLOSE_COLOR,
  })
  for (const trade of result.trades) {
    const entrySide = trade.side === "long" ? "buy" : "sell"
    markers.push(open(trade.entryTime, entrySide, trade.entryPx))
    markers.push(
      close(trade.exitTime, entrySide === "buy" ? "sell" : "buy", trade.exitPx)
    )
  }
  if (result.openPosition) {
    markers.push(
      open(
        result.openPosition.entryTime,
        result.openPosition.side === "long" ? "buy" : "sell",
        result.openPosition.entryPx
      )
    )
  }
  return markers
}
