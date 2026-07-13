import { price as fmtPrice } from "@/components/backtest/backtest-format"
import type { ChartMarker, ChartPriceLine } from "@/components/chart/price-chart"
import { CHIP_COLORS } from "@/components/chart/trade-chips"
import type { BotDetailResponse, BotMarketState } from "@/lib/api/bots"
import type { ProtectionSettings } from "@/lib/strategies/settings"

/** Profit/loss colors for the draggable take-profit / stop-loss lines. */
const GREEN = "#089981"
const RED = "#f23645"
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
  trades: BotDetailResponse["trades"],
  intervalMs: number
): ChartMarker[] {
  const fills = [...trades].sort(
    (a, b) => Date.parse(a.fill_time) - Date.parse(b.fill_time)
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
    const fillMs = new Date(fill.fill_time).getTime()
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

/**
 * A draggable SL/TP line's mapping back to a param: `toValue` converts the
 * dropped price into the param's form-string. `mark` is the live mark price at
 * drop time (the trailing stop's only reference); an empty result skips the
 * update.
 */
export type BotDragTarget = {
  key: string
  toValue: (px: number, mark: number) => string
}

/** One right-click action: sets `key` to `value` (a form-string) and saves. */
export type BotChartMenuItem = {
  key: string
  value: string
  label: string
  tone: "up" | "down"
}

/** % distance of a price from a reference, as a positive form-string. */
function pctOff(px: number, ref: number, above: boolean): string {
  const pct = above ? (px / ref - 1) * 100 : (1 - px / ref) * 100
  return String(Math.max(Math.round(pct * 100) / 100, 0.01))
}

/**
 * Bot chart lines: entry marker plus draggable TP/SL derived from the
 * Automation's protection block, drawn once positioned. Drag targets write
 * back to protection.takeProfitPct / stopLossPct.
 */
export function buildBotProtectionOverlays(
  settings: ProtectionSettings,
  state: BotMarketState | null
): { lines: ChartPriceLine[]; targets: Record<string, BotDragTarget> } {
  const lines: ChartPriceLine[] = []
  const targets: Record<string, BotDragTarget> = {}
  const position = state?.paper_position
  const szi = position ? Number(position.szi) : 0
  const entryPx = szi !== 0 && position ? Number(position.entryPx) : 0
  if (!(entryPx > 0)) return { lines, targets }

  const long = szi > 0
  lines.push({
    id: "entry",
    price: entryPx,
    color: "#3b82f6",
    title: "Entry",
    lineStyle: "solid",
  })
  if (settings.takeProfitPct) {
    lines.push({
      id: "take-profit",
      price: long
        ? entryPx * (1 + settings.takeProfitPct / 100)
        : entryPx * (1 - settings.takeProfitPct / 100),
      color: GREEN,
      title: "Take profit",
      lineStyle: "solid",
      lineWidth: 2,
      draggable: true,
    })
  }
  targets["take-profit"] = {
    key: "takeProfitPct",
    toValue: (px) => pctOff(px, entryPx, long),
  }
  if (settings.stopLossPct) {
    lines.push({
      id: "stop-loss",
      price: long
        ? entryPx * (1 - settings.stopLossPct / 100)
        : entryPx * (1 + settings.stopLossPct / 100),
      color: RED,
      title: "Stop loss",
      lineStyle: "solid",
      lineWidth: 2,
      draggable: true,
    })
  }
  targets["stop-loss"] = {
    key: "stopLossPct",
    toValue: (px) => pctOff(px, entryPx, !long),
  }
  return { lines, targets }
}

/** Right-click chart menu: add whichever of TP/SL isn't set. */
export function buildBotProtectionMenuItems(
  settings: ProtectionSettings,
  state: BotMarketState | null,
  markPrice: number,
  price: number
): BotChartMenuItem[] {
  const items: BotChartMenuItem[] = []
  const position = state?.paper_position
  const entryPx =
    position && Number(position.szi) !== 0 ? Number(position.entryPx) : 0
  const ref = entryPx > 0 ? entryPx : markPrice
  if (!(ref > 0)) return items
  const value = pctOff(price, ref, price >= ref)
  const at = fmtPrice(price)
  if (!settings.takeProfitPct) {
    items.push({
      key: "takeProfitPct",
      value,
      label: `Set take profit @ ${at} (${value}%)`,
      tone: "up",
    })
  }
  if (!settings.stopLossPct) {
    items.push({
      key: "stopLossPct",
      value,
      label: `Set stop loss @ ${at} (${value}%)`,
      tone: "down",
    })
  }
  return items
}
