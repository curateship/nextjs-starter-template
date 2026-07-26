import type { ChartMarker } from "@/components/chart/price-chart"
import { CHIP_COLORS } from "@/components/chart/trade-chips"

import { fillTimeMs, type RoundTripFill } from "./bot-round-trips"

const EPS = 1e-9

/**
 * Price-pinned chips for a bot's fills, matching the backtest chart. Color
 * carries the side (green = long, red = short, yellow = flip); the letter says
 * open ("O"), close ("C"), or flip ("F"). Fills are walked oldest → newest
 * tracking the signed position, so we know which side each fill opens or closes
 * and can render a reverse (close + reopen in one fill) as a single yellow "F"
 * instead of a close and an open side by side.
 *
 * Live fills land mid-candle, but the chart can only place a chip on an exact
 * bar time, so each fill snaps to the candle bucket containing it
 * (`intervalMs`). The chip's price stays the exact fill price.
 *
 * A burst of fills at one price inside one candle (a DCA safety order filled
 * in slices during a flash dip) collapses to a single chip — otherwise the
 * chart's collision declutter fans the identical chips sideways across
 * candles where nothing traded.
 */
export function buildBotFillMarkers(
  trades: RoundTripFill[],
  intervalMs: number
): ChartMarker[] {
  const fills = [...trades].sort(
    (a, b) => fillTimeMs(a.fill_time) - fillTimeMs(b.fill_time)
  )
  const seen = new Set<string>()
  const markers: ChartMarker[] = []
  let pos = 0
  const push = (
    time: number,
    side: "buy" | "sell",
    price: number,
    letter: "O" | "C" | "F",
    color: string,
    textColor?: string
  ) => {
    const key = `${time}:${letter}:${price}`
    if (seen.has(key)) return
    seen.add(key)
    markers.push(textColor ? { time, side, price, letter, color, textColor } : { time, side, price, letter, color })
  }

  for (const fill of fills) {
    const qty = Number(fill.sz)
    const px = Number(fill.px)
    const fillPnl = Number(fill.closed_pnl ?? 0)
    const dir = fill.side === "buy" ? 1 : -1
    const side = fill.side === "buy" ? ("buy" as const) : ("sell" as const)
    const fillMs = fillTimeMs(fill.fill_time)
    const time = Math.floor(fillMs / intervalMs) * intervalMs
    if (!(qty > EPS) || !(px > 0)) continue

    if (Math.abs(pos) < EPS) {
      if (fillPnl !== 0) {
        // A closing fill for a position that opened before our fill history —
        // still shown, colored by the side it closed (a sell closes a long).
        push(time, side, px, "C", dir < 0 ? CHIP_COLORS.long : CHIP_COLORS.short)
        continue
      }
      // Opening a fresh position.
      push(time, side, px, "O", dir > 0 ? CHIP_COLORS.long : CHIP_COLORS.short)
      pos = dir * qty
      continue
    }

    const sameDir = dir > 0 === pos > 0
    if (sameDir) {
      // Scaling in (DCA safety orders, grid adds) — colored by the open side.
      push(time, side, px, "O", pos > 0 ? CHIP_COLORS.long : CHIP_COLORS.short)
      pos += dir * qty
      continue
    }

    // Reducing — possibly through zero into a flip.
    const reduce = Math.min(Math.abs(pos), qty)
    const remainder = qty - reduce
    const closedSideColor = pos > 0 ? CHIP_COLORS.long : CHIP_COLORS.short
    pos += dir * reduce
    if (Math.abs(pos) < EPS) pos = 0
    if (remainder > EPS) {
      // Flip: closed the old side and opened the opposite in one fill.
      push(time, side, px, "F", CHIP_COLORS.flip, CHIP_COLORS.flipText)
      pos = dir * remainder
    } else {
      // Pure close (or a partial scale-out), colored by the side being closed.
      push(time, side, px, "C", closedSideColor)
    }
  }
  return markers
}
