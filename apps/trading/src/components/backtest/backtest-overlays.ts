import type {
  ChartBarColor,
  ChartMarker,
  ChartOverlayLine,
  ChartPriceLine,
  ChartZone,
} from "@/components/chart/price-chart"
import { CHIP_COLORS } from "@/components/chart/trade-chips"
import { orderLabelFor } from "@/lib/automations/node-registry"
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

/** A sell whose price lands this close to a rung's buy counts as that rung. */
const RUNG_MATCH_TOLERANCE = 0.001

/**
 * Which ladder step a buy was: `dca:b:0` is the first rung, so it reads
 * "Rung 1". Exits carry no rung in their purpose, so they are matched by price
 * below instead.
 */
function buyRungIndex(purpose: string): number | null {
  const match = purpose.match(/:b:(\d+)$/)
  return match ? Number(match[1]) : null
}

/**
 * One static arrow per fill: every DCA ladder buy and every exit sell drawn at
 * the exact price and time it happened, instead of one blended averaged-down
 * entry per round trip. These markers carry no letter, so the chart renders
 * them as its lightweight native green up / red down arrows (no animated chips)
 * — a long run with a deep ladder stays cheap to draw. Each carries the words
 * and the dollar value the chart shows when you hover it.
 */
export function buildRunFillMarkers(result: BacktestResult): ChartMarker[] {
  // Buys of the cycle currently open, so a sell can say which rung it sold at.
  // The engine's exit purposes (`dca:s:all`, `dca:exit`) carry no rung number —
  // the ladder rests ONE order for the whole position at the step above its
  // deepest buy, so the rung is recoverable from the price and only from the
  // price. Cleared on every sell, since that closes the position.
  let openBuys: { rung: number; px: number }[] = []

  return result.fills.map((fill) => {
    const rung = buyRungIndex(fill.purpose)
    let label: string

    if (fill.side === "buy") {
      if (rung !== null) openBuys.push({ rung, px: fill.px })
      label = rung !== null ? `Rung ${rung + 1}` : orderLabelFor(fill.purpose)
    } else {
      // Only claim a rung when the prices genuinely agree — a stop-out or a
      // bounce fill lands nowhere near a rung, and inventing a number for it
      // would be worse than saying nothing.
      const soldAt = openBuys
        .filter(
          (buy) =>
            buy.px > 0 &&
            Math.abs(fill.px / buy.px - 1) <= RUNG_MATCH_TOLERANCE
        )
        // Nearest, not first: a reclaim can re-arm a rung at an unusual price,
        // and naming the wrong step would be worse than naming none.
        .sort(
          (a, b) =>
            Math.abs(fill.px / a.px - 1) - Math.abs(fill.px / b.px - 1)
        )[0]
      // Both exit paths close the WHOLE position — the ladder's own sell rests
      // for everything it holds, and the forced exit is a reduce-only market
      // order sized to the full position. So the useful thing to say is how
      // many rungs just got closed, not merely that something was sold.
      // Counted as DISTINCT rungs: one rung can fill in several pieces, and
      // counting fills would claim more steps than the ladder actually took.
      const held = new Set(openBuys.map((buy) => buy.rung)).size
      const rungs = `${held} rung${held === 1 ? "" : "s"}`
      const at = soldAt ? ` at Rung ${soldAt.rung + 1}` : ""
      if (/:exit$/.test(fill.purpose)) {
        label = held > 0 ? `Exit all ${rungs}` : "Exit"
      } else if (/:s:all$/.test(fill.purpose)) {
        label = held > 0 ? `Sell all ${rungs}${at}` : `Sell all${at}`
      } else {
        label = `${orderLabelFor(fill.purpose)}${at}`
      }
      openBuys = []
    }

    return {
      time: fill.t,
      side: fill.side,
      price: fill.px,
      // What this arrow is and what it cost. Size is recorded in coins; the
      // dollars are what compare across a basket, so the chart reads
      // "Rung 3 · $219" instead of leaving a bare arrow among identical ones.
      label,
      value: fill.px * fill.sz,
    }
  })
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
