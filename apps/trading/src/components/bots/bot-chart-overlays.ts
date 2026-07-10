import { price as fmtPrice } from "@/components/backtest/backtest-format"
import type { ChartMarker, ChartPriceLine } from "@/components/chart/price-chart"
import type { BotDetailResponse, BotMarketState } from "@/lib/api/bots"
import type { StrategySettings } from "@/lib/strategies/settings"

const GREEN = "#089981"
const RED = "#f23645"

/**
 * Price-pinned chips for a bot's fills, matching the backtest chart's O/C
 * style: green "O" for opening fills, red "C" for closing ones. Open vs close
 * uses the same heuristic as the trades table — a fill with realized P&L
 * closed something — so a rare zero-P&L closing fill reads as "O".
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
  const seen = new Set<string>()
  const markers: ChartMarker[] = []
  for (const trade of trades) {
    const closes = Number(trade.closed_pnl ?? 0) !== 0
    const fillMs = new Date(trade.fill_time).getTime()
    const time = Math.floor(fillMs / intervalMs) * intervalMs
    const letter = closes ? ("C" as const) : ("O" as const)
    const key = `${time}:${letter}:${trade.px}`
    if (seen.has(key)) continue
    seen.add(key)
    markers.push({
      time,
      side: trade.side === "buy" ? ("buy" as const) : ("sell" as const),
      price: Number(trade.px),
      letter,
      color: closes ? RED : GREEN,
    })
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
 * New-model ("signal") bot chart lines: entry marker plus draggable TP/SL
 * derived from the universal settings block, drawn once positioned. Drag
 * targets write back to settings.takeProfitPct / stopLossPct.
 */
export function buildSignalBotOverlays(
  settings: StrategySettings,
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

/** Right-click menu for signal bots: add whichever of TP/SL isn't set. */
export function buildSignalBotMenuItems(
  settings: StrategySettings,
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

