import { price as fmtPrice } from "@/components/backtest/backtest-format"
import { buildBotChartLines } from "@/components/bots/bot-chart-lines"
import type { ChartPriceLine } from "@/components/trading/price-chart"
import type { BotDetailResponse, BotMarketState } from "@/lib/api/bots"
import type { StrategyParams } from "@/lib/strategies/params"

const GREEN = "#089981"
const RED = "#f23645"

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

/** The position/anchor references SL/TP levels are derived from. */
function referencesOf(state: BotMarketState | null) {
  const position = state?.paper_position
  const szi = position ? Number(position.szi) : 0
  return {
    szi,
    entryPx: szi !== 0 && position ? Number(position.entryPx) : 0,
    anchorPx: Number(
      ((state?.strategy_state ?? {}) as { anchorPx?: number | null })
        .anchorPx ?? 0
    ),
  }
}

/** % distance of a price from a reference, as a positive form-string. */
function pctOff(px: number, ref: number, above: boolean): string {
  const pct = above ? (px / ref - 1) * 100 : (1 - px / ref) * 100
  return String(Math.max(Math.round(pct * 100) / 100, 0.01))
}

/**
 * Chart price lines for a bot plus the drag-targets that map its SL/TP lines
 * back to params. Percent-based levels that `buildBotChartLines` can't place
 * yet (no anchor or position) fall back to the best available reference —
 * entry, then anchor, then the live mark — drawn dashed as a preview, so a
 * saved SL/TP is always visible on the chart.
 */
export function buildBotOverlays(
  params: StrategyParams,
  state: BotMarketState | null,
  openOrders: BotDetailResponse["open_orders"],
  markPrice: number
): { lines: ChartPriceLine[]; targets: Record<string, BotDragTarget> } {
  const lines: ChartPriceLine[] = buildBotChartLines(params, state, openOrders)
  const targets: Record<string, BotDragTarget> = {}
  const { szi, entryPx, anchorPx } = referencesOf(state)

  const px6 = (px: number) => String(Number(px.toPrecision(6)))
  const hasLine = (id: string) => lines.some((line) => line.id === id)
  const pushLine = (
    id: string,
    price: number,
    color: string,
    title: string,
    dashed = false
  ) => {
    if (price > 0) {
      lines.push({
        id,
        price,
        color,
        title,
        lineStyle: dashed ? "dashed" : "solid",
        lineWidth: 2,
      })
    }
  }

  if (params.strategyType === "grid") {
    targets["take-profit"] = { key: "takeProfitPx", toValue: px6 }
    targets["stop-loss"] = { key: "stopLossPx", toValue: px6 }
  } else if (params.strategyType === "dca") {
    const long = params.direction === "long"
    const tpRef = entryPx || anchorPx || markPrice
    const stopRef = anchorPx || entryPx || markPrice
    if (tpRef > 0) {
      if (params.takeProfitPct && !hasLine("take-profit")) {
        pushLine(
          "take-profit",
          long
            ? tpRef * (1 + params.takeProfitPct / 100)
            : tpRef * (1 - params.takeProfitPct / 100),
          GREEN,
          "Take profit",
          entryPx === 0
        )
      }
      targets["take-profit"] = {
        key: "takeProfitPct",
        toValue: (px) => pctOff(px, tpRef, long),
      }
    }
    if (stopRef > 0) {
      if (params.stopLossPct && !hasLine("stop-loss")) {
        pushLine(
          "stop-loss",
          long
            ? stopRef * (1 - params.stopLossPct / 100)
            : stopRef * (1 + params.stopLossPct / 100),
          RED,
          "Stop loss",
          anchorPx === 0
        )
      }
      targets["stop-loss"] = {
        key: "stopLossPct",
        toValue: (px) => pctOff(px, stopRef, !long),
      }
    }
  } else if (params.strategyType === "momentum") {
    // The trail ratchets off the live mid, so invert against the mark.
    if (params.stopMode === "trailing") {
      if (params.trailingStopPct && !hasLine("trailing-stop") && markPrice > 0) {
        const long = params.direction !== "short"
        pushLine(
          "trailing-stop",
          long
            ? markPrice * (1 - params.trailingStopPct / 100)
            : markPrice * (1 + params.trailingStopPct / 100),
          RED,
          "Trailing stop",
          true
        )
      }
      targets["trailing-stop"] = {
        key: "trailingStopPct",
        toValue: (px, mark) =>
          mark > 0
            ? String(
                Math.max(Math.round(Math.abs(px / mark - 1) * 10000) / 100, 0.01)
              )
            : "",
      }
    }
  } else if (params.strategyType === "qqe") {
    // Draw TP/SL only once there's an actual position — no floating preview off
    // the mark, which would otherwise clutter every flat market's chart.
    const long = szi > 0
    if (entryPx > 0) {
      if (params.takeProfitPct) {
        pushLine(
          "take-profit",
          long
            ? entryPx * (1 + params.takeProfitPct / 100)
            : entryPx * (1 - params.takeProfitPct / 100),
          GREEN,
          "Take profit"
        )
        targets["take-profit"] = {
          key: "takeProfitPct",
          toValue: (px) => pctOff(px, entryPx, long),
        }
      }
      if (params.stopLossPct && !params.swingStopLoss) {
        pushLine(
          "stop-loss",
          long
            ? entryPx * (1 - params.stopLossPct / 100)
            : entryPx * (1 + params.stopLossPct / 100),
          RED,
          "Stop loss"
        )
        targets["stop-loss"] = {
          key: "stopLossPct",
          toValue: (px) => pctOff(px, entryPx, !long),
        }
      }
    }
  } else if (params.strategyType === "vwap") {
    // Draw TP/SL only once there's an actual position (no flat-market preview).
    const long = szi > 0
    if (entryPx > 0) {
      if (params.takeProfitPct) {
        pushLine(
          "take-profit",
          long
            ? entryPx * (1 + params.takeProfitPct / 100)
            : entryPx * (1 - params.takeProfitPct / 100),
          GREEN,
          "Take profit"
        )
        targets["take-profit"] = {
          key: "takeProfitPct",
          toValue: (px) => pctOff(px, entryPx, long),
        }
      }
      if (params.stopLossPct) {
        pushLine(
          "stop-loss",
          long
            ? entryPx * (1 - params.stopLossPct / 100)
            : entryPx * (1 + params.stopLossPct / 100),
          RED,
          "Stop loss"
        )
        targets["stop-loss"] = {
          key: "stopLossPct",
          toValue: (px) => pctOff(px, entryPx, !long),
        }
      }
    }
  }

  return {
    lines: lines.map((line) =>
      targets[line.id] ? { ...line, draggable: true } : line
    ),
    targets,
  }
}

/**
 * Right-click menu actions for a clicked chart price: only the protective
 * levels the params don't already set. Percent-based strategies convert
 * against the position entry when open (the ladder anchor for DCA stops),
 * otherwise the live mark.
 */
export function buildBotChartMenuItems(
  params: StrategyParams,
  state: BotMarketState | null,
  markPrice: number,
  price: number
): BotChartMenuItem[] {
  const items: BotChartMenuItem[] = []
  const { entryPx, anchorPx } = referencesOf(state)
  const pctRef = entryPx > 0 ? entryPx : markPrice
  const absPct = (ref: number) =>
    ref > 0 ? pctOff(price, ref, price >= ref) : null
  const at = fmtPrice(price)

  switch (params.strategyType) {
    case "grid": {
      const px = String(Number(price.toPrecision(6)))
      if (!params.takeProfitPx) {
        items.push({
          key: "takeProfitPx",
          value: px,
          label: `Set take profit @ ${at}`,
          tone: "up",
        })
      }
      if (!params.stopLossPx) {
        items.push({
          key: "stopLossPx",
          value: px,
          label: `Set stop loss @ ${at}`,
          tone: "down",
        })
      }
      break
    }
    case "dca": {
      // TP is a required param, so only the optional stop can be added.
      if (!params.stopLossPct) {
        const value = absPct(anchorPx > 0 ? anchorPx : pctRef)
        if (value) {
          items.push({
            key: "stopLossPct",
            value,
            label: `Set stop loss @ ${at} (${value}%)`,
            tone: "down",
          })
        }
      }
      break
    }
    case "momentum": {
      if (params.stopMode === "trailing" && !params.trailingStopPct) {
        const value = absPct(markPrice)
        if (value) {
          items.push({
            key: "trailingStopPct",
            value,
            label: `Set trailing stop @ ${at} (${value}%)`,
            tone: "down",
          })
        }
      }
      break
    }
    case "qqe": {
      if (!params.takeProfitPct) {
        const value = absPct(pctRef)
        if (value) {
          items.push({
            key: "takeProfitPct",
            value,
            label: `Set take profit @ ${at} (${value}%)`,
            tone: "up",
          })
        }
      }
      if (!params.stopLossPct && !params.swingStopLoss) {
        const value = absPct(pctRef)
        if (value) {
          items.push({
            key: "stopLossPct",
            value,
            label: `Set stop loss @ ${at} (${value}%)`,
            tone: "down",
          })
        }
      }
      break
    }
    case "vwap": {
      if (!params.takeProfitPct) {
        const value = absPct(pctRef)
        if (value) {
          items.push({
            key: "takeProfitPct",
            value,
            label: `Set take profit @ ${at} (${value}%)`,
            tone: "up",
          })
        }
      }
      if (!params.stopLossPct) {
        const value = absPct(pctRef)
        if (value) {
          items.push({
            key: "stopLossPct",
            value,
            label: `Set stop loss @ ${at} (${value}%)`,
            tone: "down",
          })
        }
      }
      break
    }
    case "copy":
      break
  }
  return items
}
