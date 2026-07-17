import type {
  ChartBarColor,
  ChartMarker,
  ChartOverlayLine,
  ChartPriceLine,
  ChartZone,
} from "@/components/chart/price-chart"
import { CHIP_COLORS } from "@/components/chart/trade-chips"
import type { BacktestResult } from "@/lib/backtest/types"
import type { AutomationProtection } from "@/lib/automations/automation"
import { trailingStopPath } from "@/lib/strategies/trailing-stop"
import type { IndicatorConfig } from "@/lib/trading/indicators-config"

export type StrategyChartOverlays = {
  /** Rendered through the shared indicator system (theme-aware). */
  indicators: IndicatorConfig[]
  /** Generic line series (breakout channel). */
  overlayLines: ChartOverlayLine[]
  /** Horizontal levels (TP / SL). */
  priceLines: ChartPriceLine[]
  /** Filled rectangles (QQE consolidation zones). */
  zones: ChartZone[]
  /** Per-bar candle recoloring (QQE state). */
  barColors: ChartBarColor[]
}

/**
 * Price-pinned chips for each round trip, plus any still-open position's entry.
 * A trade's chips take its side color (long green, short red); the letter says
 * open ("O") or close ("C"). A reverse — one trade closing at the exact instant
 * the opposite-side trade opens — collapses to a single yellow flip ("F") chip
 * instead of a close + reopen sitting side by side.
 */
export function buildRunMarkers(result: BacktestResult): ChartMarker[] {
  const markers: ChartMarker[] = []
  const trades = result.trades
  const open = result.openPosition
  // The reopen half of a flip can be the next trade OR the still-open position
  // (a reverse whose new side never closed within the window).
  const nextOpenAfter = (i: number) =>
    trades[i + 1] ?? (i === trades.length - 1 ? open : null)
  for (let i = 0; i < trades.length; i += 1) {
    const trade = trades[i]
    const prev = trades[i - 1]
    const next = nextOpenAfter(i)
    const entrySide = trade.side === "long" ? "buy" : "sell"
    const sideColor = trade.side === "long" ? CHIP_COLORS.long : CHIP_COLORS.short
    // A flip point is a close and an opposite-side open at the same instant.
    const flipIn =
      prev && prev.exitTime === trade.entryTime && prev.side !== trade.side
    const flipOut =
      next && next.entryTime === trade.exitTime && next.side !== trade.side
    // Entry chip — skipped when this open is the reopen half of a flip the
    // previous trade's exit already marked.
    if (!flipIn) {
      markers.push({
        time: trade.entryTime,
        side: entrySide,
        price: trade.entryPx,
        letter: "O",
        color: sideColor,
      })
    }
    // Exit chip — one yellow "F" for a flip, otherwise a side-colored "C".
    if (flipOut) {
      markers.push({
        time: trade.exitTime,
        side: entrySide === "buy" ? "sell" : "buy",
        price: trade.exitPx,
        letter: "F",
        color: CHIP_COLORS.flip,
        textColor: CHIP_COLORS.flipText,
      })
    } else {
      markers.push({
        time: trade.exitTime,
        side: entrySide === "buy" ? "sell" : "buy",
        price: trade.exitPx,
        letter: "C",
        color: sideColor,
      })
    }
  }
  if (open) {
    const last = trades[trades.length - 1]
    // Skip the open marker when this position is the reopen half of a flip the
    // last trade's exit already marked with an "F".
    const isFlipReopen =
      last && last.exitTime === open.entryTime && last.side !== open.side
    if (!isFlipReopen) {
      markers.push({
        time: open.entryTime,
        side: open.side === "long" ? "buy" : "sell",
        price: open.entryPx,
        letter: "O",
        color: open.side === "long" ? CHIP_COLORS.long : CHIP_COLORS.short,
      })
    }
  }
  return markers
}

/**
 * Dashed red stop-path segments for a run that used a trailing stop — one
 * line per trade so the ratchet is visible bar by bar. Fixed-stop and no-stop
 * runs return nothing. The per-bar levels come from the same shared math the
 * engine's exits use.
 */
export function buildTrailingStopOverlays(
  protection: AutomationProtection | undefined,
  result: BacktestResult,
  candles: { t: number; h: string | number; l: string | number }[]
): ChartOverlayLine[] {
  if (
    !protection ||
    (protection.long?.stopLossMode !== "trailing" &&
      protection.short?.stopLossMode !== "trailing")
  ) {
    return []
  }
  const bars = candles.map((candle) => ({
    t: candle.t,
    h: Number(candle.h),
    l: Number(candle.l),
  }))
  const lines: ChartOverlayLine[] = []
  const segments = [
    ...result.trades.map((trade) => ({
      side: trade.side,
      entryPx: trade.entryPx,
      from: trade.entryTime,
      to: trade.exitTime,
    })),
    ...(result.openPosition
      ? [
          {
            side: result.openPosition.side,
            entryPx: result.openPosition.entryPx,
            from: result.openPosition.entryTime,
            to: Number.POSITIVE_INFINITY,
          },
        ]
      : []),
  ]
  for (const [index, segment] of segments.entries()) {
    const settings =
      segment.side === "long" ? protection.long : protection.short
    if (!settings?.stopLossPct || settings.stopLossMode !== "trailing") {
      continue
    }
    const window = bars.filter(
      (bar) => bar.t >= segment.from && bar.t <= segment.to
    )
    const points = trailingStopPath(
      settings,
      segment.side,
      segment.entryPx,
      window
    )
    if (points.length > 0) {
      lines.push({
        id: `trailing-stop-${index}`,
        // Label only the first segment so the chart legend shows one chip.
        label: index === 0 ? "Trailing stop" : "",
        color: "#f23645",
        dashed: true,
        points,
      })
    }
  }
  return lines
}
