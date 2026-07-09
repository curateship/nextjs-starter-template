import type { ChartPriceLine } from "@/components/trading/price-chart"
import type { BotDetailResponse, BotMarketState } from "@/lib/api/bots"
import type { StrategyParams } from "@/lib/strategies/params"

const GREEN = "#089981"
const RED = "#f23645"
const BLUE = "#3b82f6"
const LEVEL_RED = "rgba(242, 54, 69, 0.45)"

/**
 * Pure derivation of the strategy-visualization price lines for the bot
 * detail chart: labeled bounds/TP/SL, dashed level ladders, solid lines for
 * every resting order, and the position entry.
 */
export function buildBotChartLines(
  params: StrategyParams,
  state: BotMarketState | null,
  openOrders: BotDetailResponse["open_orders"]
): ChartPriceLine[] {
  const lines: ChartPriceLine[] = []

  // Position entry (paper position; live positions come via reconcile later).
  const position = state?.paper_position
  if (position && Number(position.szi) !== 0) {
    lines.push({
      id: "entry",
      price: Number(position.entryPx),
      color: BLUE,
      title: "Entry",
      lineStyle: "solid",
      lineWidth: 2,
    })
  }

  // Every resting order — this is "where the orders are placed".
  for (const order of openOrders) {
    if (!order.px) continue
    lines.push({
      id: `bot-order-${order.id}`,
      price: Number(order.px),
      color: order.side === "buy" ? GREEN : RED,
      title: `${order.side === "buy" ? "Buy" : "Sell"} ${order.sz}`,
      lineStyle: "solid",
    })
  }

  if (params.strategyType === "grid") {
    const lower = Number(params.lowerPx)
    const upper = Number(params.upperPx)
    if (upper > lower && lower > 0) {
      const step = (upper - lower) / (params.levels - 1)
      for (let i = 1; i < params.levels - 1; i += 1) {
        lines.push({
          id: `grid-level-${i}`,
          price: lower + step * i,
          color: LEVEL_RED,
          title: "",
          lineStyle: "dashed",
          axisLabelVisible: false,
          lineWidth: 1,
        })
      }
      lines.push({
        id: "grid-upper",
        price: upper,
        color: BLUE,
        title: "Upper price",
        lineStyle: "solid",
        lineWidth: 2,
      })
      lines.push({
        id: "grid-lower",
        price: lower,
        color: BLUE,
        title: "Lower price",
        lineStyle: "solid",
        lineWidth: 2,
      })
    }
    if (params.takeProfitPx) {
      lines.push({
        id: "take-profit",
        price: Number(params.takeProfitPx),
        color: GREEN,
        title: "Take profit",
        lineStyle: "solid",
        lineWidth: 2,
      })
    }
    if (params.stopLossPx) {
      lines.push({
        id: "stop-loss",
        price: Number(params.stopLossPx),
        color: RED,
        title: "Stop loss",
        lineStyle: "solid",
        lineWidth: 2,
      })
    }
    return lines
  }

  if (params.strategyType === "dca") {
    const strategyState = (state?.strategy_state ?? {}) as {
      anchorPx?: number | null
    }
    const anchor = Number(strategyState.anchorPx ?? 0)
    const long = params.direction === "long"
    if (anchor > 0) {
      let deviation = 0
      for (let i = 1; i <= params.maxSafetyOrders; i += 1) {
        deviation += params.priceStepPct * params.stepMultiplier ** (i - 1)
        const px = long
          ? anchor * (1 - deviation / 100)
          : anchor * (1 + deviation / 100)
        if (px <= 0) continue
        lines.push({
          id: `dca-safety-${i}`,
          price: px,
          color: LEVEL_RED,
          title: "",
          lineStyle: "dashed",
          axisLabelVisible: false,
          lineWidth: 1,
        })
      }
      if (params.stopLossPct) {
        lines.push({
          id: "stop-loss",
          price: long
            ? anchor * (1 - params.stopLossPct / 100)
            : anchor * (1 + params.stopLossPct / 100),
          color: RED,
          title: "Stop loss",
          lineStyle: "solid",
          lineWidth: 2,
        })
      }
    }
    // TP from average entry (recomputed by the strategy each fill).
    if (position && Number(position.szi) !== 0) {
      const avgEntry = Number(position.entryPx)
      lines.push({
        id: "take-profit",
        price: long
          ? avgEntry * (1 + params.takeProfitPct / 100)
          : avgEntry * (1 - params.takeProfitPct / 100),
        color: GREEN,
        title: "Take profit",
        lineStyle: "solid",
        lineWidth: 2,
      })
    }
    return lines
  }

  if (params.strategyType === "momentum") {
    const strategyState = (state?.strategy_state ?? {}) as {
      trailPx?: number | null
    }
    if (strategyState.trailPx && strategyState.trailPx > 0) {
      lines.push({
        id: "trailing-stop",
        price: strategyState.trailPx,
        color: RED,
        title: "Trailing stop",
        lineStyle: "dashed",
        lineWidth: 2,
      })
    }
  }

  return lines
}
