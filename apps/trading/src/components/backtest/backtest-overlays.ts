import type {
  ChartBarColor,
  ChartMarker,
  ChartOverlayLine,
  ChartPriceLine,
  ChartZone,
} from "@/components/trading/price-chart"
import type { BacktestResult } from "@/lib/backtest/types"
import { highest, lowest } from "@/lib/strategies/indicators"
import { computeConsolidation, computeQqeSeries } from "@/lib/strategies/qqe"
import type { StrategyParams } from "@/lib/strategies/params"
import type { IndicatorConfig } from "@/lib/trading/indicators-config"
import type { HistoryCandle } from "@/server/backtest/history"

// Static hexes legible on both themes (LWC can't read oklch tokens).
const CHANNEL_UPPER = "#3b82f6"
const CHANNEL_LOWER = "#f59e0b"
const LEVEL_COLOR = "#a1a1aa"
const TP_COLOR = "#089981"
const SL_COLOR = "#f23645"
const QQE_NEUTRAL = "#f59e0b"
const QQE_ZONE_DEFAULT = "#2962ff"

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

/**
 * Paints a strategy's structure on the shared chart from its params: EMA and
 * RSI map to the shared indicator system, breakout to a channel, grid/DCA to
 * price lines. `result` refines anchoring (DCA base fill, open-position TP)
 * but is optional so params preview before a run. Pure and unit-tested.
 */
export function buildStrategyOverlays(
  params: StrategyParams,
  candles: HistoryCandle[],
  result: BacktestResult | null
): StrategyChartOverlays {
  const indicators: IndicatorConfig[] = []
  const overlayLines: ChartOverlayLine[] = []
  const priceLines: ChartPriceLine[] = []
  const zones: ChartZone[] = []
  const barColors: ChartBarColor[] = []
  const markers: ChartMarker[] = []

  if (params.strategyType === "momentum") {
    // The QFL base doubles as the stop line when stopMode = "base".
    if (params.stopMode === "base" && params.basePeriods && params.pumpPeriods) {
      indicators.push({
        id: "base",
        type: "base",
        enabled: true,
        params: {
          basePeriods: params.basePeriods,
          pumpPeriods: params.pumpPeriods,
        },
      })
    }
    if (params.signal === "ema_cross" && params.emaFast && params.emaSlow) {
      indicators.push(
        { id: "ema-fast", type: "ema", enabled: true, params: { period: params.emaFast } },
        { id: "ema-slow", type: "ema", enabled: true, params: { period: params.emaSlow } }
      )
    } else if (params.signal === "rsi" && params.rsiPeriod) {
      indicators.push({
        id: "rsi",
        type: "rsi",
        enabled: true,
        params: { period: params.rsiPeriod },
      })
    } else if (params.signal === "breakout" && params.breakoutLookback) {
      const lookback = params.breakoutLookback
      const upper: ChartOverlayLine["points"] = []
      const lower: ChartOverlayLine["points"] = []
      for (let i = lookback; i < candles.length; i += 1) {
        const window = candles.slice(i - lookback, i)
        upper.push({ time: candles[i].t, value: highest(window.map((c) => c.h)) })
        lower.push({ time: candles[i].t, value: lowest(window.map((c) => c.l)) })
      }
      overlayLines.push(
        { id: "breakout-high", label: `High ${lookback}`, color: CHANNEL_UPPER, points: upper },
        { id: "breakout-low", label: `Low ${lookback}`, color: CHANNEL_LOWER, points: lower }
      )
    }
  } else if (params.strategyType === "grid") {
    const lower = Number(params.lowerPx)
    const upper = Number(params.upperPx)
    if (upper > lower && params.levels >= 2) {
      // Bounds are draggable on the chart; interior levels re-ladder to follow.
      priceLines.push({
        id: "grid-lower",
        price: lower,
        color: LEVEL_COLOR,
        title: "Lower",
        lineStyle: "solid",
        draggable: true,
      })
      const step = (upper - lower) / (params.levels - 1)
      for (let i = 1; i < params.levels - 1; i += 1) {
        priceLines.push({
          id: `grid-${i}`,
          price: lower + step * i,
          color: LEVEL_COLOR,
          title: "",
          lineStyle: "dashed",
          axisLabelVisible: false,
        })
      }
      priceLines.push({
        id: "grid-upper",
        price: upper,
        color: LEVEL_COLOR,
        title: "Upper",
        lineStyle: "solid",
        draggable: true,
      })
    }
    if (params.takeProfitPx) {
      priceLines.push({
        id: "grid-tp",
        price: Number(params.takeProfitPx),
        color: TP_COLOR,
        title: "TP",
        lineStyle: "solid",
        draggable: true,
      })
    }
    if (params.stopLossPx) {
      priceLines.push({
        id: "grid-sl",
        price: Number(params.stopLossPx),
        color: SL_COLOR,
        title: "SL",
        lineStyle: "solid",
        draggable: true,
      })
    }
  } else if (params.strategyType === "qqe" && candles.length > 0) {
    // Same shared math the strategy trades on, so visuals match signals.
    // QqeParams is a structural superset of QqeInputs, so params passes as-is.
    const qqe = computeQqeSeries(candles, params)
    const cons = computeConsolidation(
      candles,
      params.loopbackPeriod,
      params.minConsolidationLen
    )

    for (let i = 0; i < candles.length; i += 1) {
      const pass = params.consolidationFilter ? !cons.inZone[i] : true
      if (qqe.buy[i] && pass) {
        markers.push({ time: candles[i].t, side: "buy" })
      } else if (qqe.sell[i] && pass) {
        markers.push({ time: candles[i].t, side: "sell" })
      }
    }

    if (params.colorBars) {
      for (let i = 0; i < candles.length; i += 1) {
        const state = qqe.barColor[i]
        if (!state) continue
        const color =
          state === "green" ? TP_COLOR : state === "red" ? SL_COLOR : QQE_NEUTRAL
        barColors.push({ time: candles[i].t, color })
      }
    }
    if (params.paintConsolidation) {
      const fill = hexWithAlpha(params.zoneColor ?? QQE_ZONE_DEFAULT, 0.2)
      for (const zone of cons.zones) {
        zones.push({
          id: `qqe-zone-${zone.startIndex}`,
          fromMs: candles[zone.startIndex].t,
          toMs: candles[zone.endIndex].t,
          top: zone.high,
          bottom: zone.low,
          fillColor: fill,
        })
      }
    }
  } else if (params.strategyType === "dca") {
    // Ladder anchors on the cycle's base fill; before a run, preview from the
    // latest close as "if the cycle started now".
    const base = result?.fills.find((f) => f.purpose === "dca:base")
    const anchor = base?.px ?? candles[candles.length - 1]?.c
    if (anchor && anchor > 0) {
      const long = params.direction === "long"
      let deviation = 0
      for (let i = 1; i <= params.maxSafetyOrders; i += 1) {
        deviation += params.priceStepPct * params.stepMultiplier ** (i - 1)
        const px = long
          ? anchor * (1 - deviation / 100)
          : anchor * (1 + deviation / 100)
        if (px > 0) {
          priceLines.push({
            id: `dca-safety-${i}`,
            price: px,
            color: LEVEL_COLOR,
            title: "",
            lineStyle: "dashed",
            axisLabelVisible: false,
          })
        }
      }
      if (result?.openPosition) {
        const avg = result.openPosition.entryPx
        const tp = long
          ? avg * (1 + params.takeProfitPct / 100)
          : avg * (1 - params.takeProfitPct / 100)
        priceLines.push({
          id: "dca-tp",
          price: tp,
          color: TP_COLOR,
          title: "TP",
          lineStyle: "solid",
        })
      }
    }
  }

  return { indicators, overlayLines, priceLines, zones, barColors, markers }
}

/** "#rrggbb" → "rgba(r, g, b, a)". */
function hexWithAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** Entry/exit arrows for each round trip, plus the open position's entry. */
export function buildRunMarkers(result: BacktestResult): ChartMarker[] {
  const markers: ChartMarker[] = []
  for (const trade of result.trades) {
    markers.push({ time: trade.entryTime, side: trade.side === "long" ? "buy" : "sell" })
    markers.push({ time: trade.exitTime, side: trade.side === "long" ? "sell" : "buy" })
  }
  if (result.openPosition) {
    markers.push({
      time: result.openPosition.entryTime,
      side: result.openPosition.side === "long" ? "buy" : "sell",
    })
  }
  return markers
}
