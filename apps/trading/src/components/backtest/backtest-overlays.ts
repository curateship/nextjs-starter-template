import type {
  ChartBarColor,
  ChartMarker,
  ChartOverlayLine,
  ChartPriceLine,
  ChartZone,
} from "@/components/trading/price-chart"
import type { BacktestResult } from "@/lib/backtest/types"
import { highest, lowest, vwapBands } from "@/lib/strategies/indicators"
import {
  computeConsolidation,
  computeQqeSeries,
  computeSwings,
} from "@/lib/strategies/qqe"
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
/** Trend re-entry ("re-buy") bars — pink, legible on both chart themes. */
const QQE_REENTRY = "#ec4899"
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

    // Fresh QQE crosses out of consolidation — used only to tell a re-entry
    // (continuation) from a stop-and-reverse entry, so it can be painted pink.
    const freshTimes = new Set<number>()
    for (let i = 0; i < candles.length; i += 1) {
      const pass = params.consolidationFilter ? !cons.inZone[i] : true
      if ((qqe.buy[i] || qqe.sell[i]) && pass) freshTimes.add(candles[i].t)
    }

    // Markers mark ACTUAL trades, one arrow per entry and per exit, so they
    // match the trades table exactly (a long enters with a buy and exits with a
    // sell; shorts mirror). Re-entry entries — a trade entry not on a fresh
    // cross — are pink. Warmup bars carry no trades, so they carry no arrows.
    // Before a run exists (config preview), fall back to the raw signal crosses
    // so the user can still see where signals would fire.
    const reentryTimes = new Set<number>()
    if (result) {
      const markEntry = (
        time: number,
        side: "long" | "short",
        price: number
      ) => {
        const reentry = Boolean(params.trendReentry) && !freshTimes.has(time)
        if (reentry) reentryTimes.add(time)
        const mside = side === "long" ? "buy" : "sell"
        markers.push({
          time,
          side: mside,
          price,
          letter: reentry ? "R" : "O",
          color: reentry ? QQE_REENTRY : OPEN_COLOR,
        })
      }
      for (const trade of result.trades) {
        markEntry(trade.entryTime, trade.side, trade.entryPx)
        const exitSide = trade.side === "long" ? "sell" : "buy"
        markers.push({
          time: trade.exitTime,
          side: exitSide,
          price: trade.exitPx,
          letter: "C",
          color: CLOSE_COLOR,
        })
      }
      if (result.openPosition) {
        markEntry(
          result.openPosition.entryTime,
          result.openPosition.side,
          result.openPosition.entryPx
        )
      }
    } else {
      for (let i = 0; i < candles.length; i += 1) {
        const pass = params.consolidationFilter ? !cons.inZone[i] : true
        if (qqe.buy[i] && pass) markers.push({ time: candles[i].t, side: "buy" })
        else if (qqe.sell[i] && pass) markers.push({ time: candles[i].t, side: "sell" })
      }
    }

    if (params.colorBars) {
      for (let i = 0; i < candles.length; i += 1) {
        // Re-buy bars are painted pink below, overriding the QQE state color.
        if (reentryTimes.has(candles[i].t)) continue
        const state = qqe.barColor[i]
        if (!state) continue
        const color =
          state === "green" ? TP_COLOR : state === "red" ? SL_COLOR : QQE_NEUTRAL
        barColors.push({ time: candles[i].t, color })
      }
    }
    // Pink re-buy candles show regardless of colorBars, so re-entries are visible.
    for (const time of reentryTimes) {
      barColors.push({ time, color: QQE_REENTRY })
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
    if (params.paintSwings) {
      // A short horizontal mark at each swing pivot (not a held-forward line —
      // that reads as a jumbled staircase). Each mark is its own 2-point series
      // so lightweight-charts doesn't bridge them into a zigzag.
      const swings = computeSwings(candles, params.swingLookback)
      // A short mark centered on the pivot bar — long segments float as shelves
      // above/below later candles once price moves away from the pivot.
      const HALF = 2
      const mark = (pivot: { index: number; value: number }): ChartOverlayLine["points"] => {
        const start = Math.max(0, pivot.index - HALF)
        const end = Math.min(pivot.index + HALF, candles.length - 1)
        return [
          { time: candles[start].t, value: pivot.value },
          { time: candles[end].t, value: pivot.value },
        ]
      }
      for (const pivot of swings.highPivots) {
        overlayLines.push({
          id: `swing-high-${pivot.index}`,
          label: "",
          color: TP_COLOR,
          points: mark(pivot),
        })
      }
      for (const pivot of swings.lowPivots) {
        overlayLines.push({
          id: `swing-low-${pivot.index}`,
          label: "",
          color: SL_COLOR,
          points: mark(pivot),
        })
      }
    }
  } else if (params.strategyType === "vwap") {
    // The VWAP line is drawn through the shared indicator (daily-reset), same
    // math the strategy trades on. Reversion mode also paints its σ-bands.
    indicators.push({ id: "vwap", type: "vwap", enabled: true, params: {} })
    if (params.mode === "reversion" && candles.length > 0) {
      const { upper, lower } = vwapBands(candles, params.bandK ?? 2)
      const upperPts: ChartOverlayLine["points"] = []
      const lowerPts: ChartOverlayLine["points"] = []
      for (let i = 0; i < candles.length; i += 1) {
        if (Number.isFinite(upper[i])) {
          upperPts.push({ time: candles[i].t, value: upper[i] })
          lowerPts.push({ time: candles[i].t, value: lower[i] })
        }
      }
      overlayLines.push(
        { id: "vwap-upper", label: `+${params.bandK ?? 2}σ`, color: CHANNEL_UPPER, points: upperPts },
        { id: "vwap-lower", label: `−${params.bandK ?? 2}σ`, color: CHANNEL_LOWER, points: lowerPts }
      )
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
