import { describe, expect, it } from "vitest"

import {
  buildBotChartMenuItems,
  buildBotOverlays,
} from "./bot-chart-overlays"
import type { BotDetailResponse } from "@/lib/api/bots"
import type { StrategyParams } from "@/lib/strategies/params"

const emptyState: NonNullable<BotDetailResponse["state"]> = {
  strategy_state: {},
  paper_position: null,
  paper_cash: null,
  daily_realized_pnl: 0,
  consecutive_losses: 0,
  cooldown_until: null,
  peak_equity: null,
  last_eval_at: null,
}

const grid: StrategyParams = {
  strategyType: "grid",
  lowerPx: "1000",
  upperPx: "2000",
  levels: 11,
  sizePerLevelUsd: 100,
  side: "both",
  stopLossPx: "800",
  takeProfitPx: "2400",
}

const dcaLong: StrategyParams = {
  strategyType: "dca",
  direction: "long",
  baseOrderUsd: 100,
  safetyOrderUsd: 100,
  maxSafetyOrders: 3,
  priceStepPct: 1,
  stepMultiplier: 2,
  sizeMultiplier: 1,
  takeProfitPct: 2,
  stopLossPct: 10,
}

const qqe: StrategyParams = {
  strategyType: "qqe",
  interval: "15m",
  rsiPeriod: 14,
  rsiSmoothing: 5,
  qqeFactor: 4.238,
  threshold: 10,
  maType: "EMA",
  rsiSource: "close",
  colorBars: true,
  consolidationFilter: true,
  loopbackPeriod: 50,
  minConsolidationLen: 5,
  paintConsolidation: false,
  paintSwings: false,
  swingLookback: 10,
  swingStopLoss: false,
  orderSizeUsd: 250,
  takeProfitPct: 5,
  stopLossPct: 3,
}

const momentumTrailing: StrategyParams = {
  strategyType: "momentum",
  signal: "ema_cross",
  interval: "15m",
  emaFast: 12,
  emaSlow: 26,
  stopMode: "trailing",
  trailingStopPct: 2,
  orderSizeUsd: 250,
  direction: "both",
}

describe("buildBotOverlays — drag targets", () => {
  it("maps grid SL/TP lines to absolute-price params and marks them draggable", () => {
    const { lines, targets } = buildBotOverlays(grid, emptyState, [], 1500)
    const byId = new Map(lines.map((line) => [line.id, line]))

    expect(byId.get("take-profit")?.draggable).toBe(true)
    expect(byId.get("stop-loss")?.draggable).toBe(true)
    // Absolute price passes straight through (rounded to 6 sig figs).
    expect(targets["take-profit"].toValue(2555.5, 1500)).toBe("2555.5")
    expect(targets["stop-loss"].key).toBe("stopLossPx")
  })

  it("previews DCA SL/TP off the mark when flat, dashed, and converts drags to %", () => {
    const { lines, targets } = buildBotOverlays(dcaLong, emptyState, [], 100)
    const byId = new Map(lines.map((line) => [line.id, line]))

    // No position/anchor yet → derived off the mark (100), drawn dashed.
    expect(byId.get("take-profit")?.price).toBeCloseTo(102) // +2%
    expect(byId.get("take-profit")?.lineStyle).toBe("dashed")
    expect(byId.get("stop-loss")?.price).toBeCloseTo(90) // -10%
    expect(byId.get("stop-loss")?.lineStyle).toBe("dashed")

    // Dragging TP up to 110 (long, above the ref) → +10%.
    expect(targets["take-profit"].toValue(110, 100)).toBe("10")
    // Dragging SL down to 95 (long, below the ref) → 5%.
    expect(targets["stop-loss"].toValue(95, 100)).toBe("5")
  })

  it("keeps DCA lines solid and anchored once a position exists", () => {
    const { lines } = buildBotOverlays(
      dcaLong,
      {
        ...emptyState,
        strategy_state: { anchorPx: 100 },
        paper_position: { szi: 1, entryPx: 99 },
      },
      [],
      100
    )
    const byId = new Map(lines.map((line) => [line.id, line]))
    // From buildBotChartLines: TP off avg entry (99), SL off anchor (100).
    expect(byId.get("take-profit")?.price).toBeCloseTo(99 * 1.02)
    expect(byId.get("take-profit")?.lineStyle).toBe("solid")
    expect(byId.get("stop-loss")?.price).toBeCloseTo(90)
  })

  it("derives QQE SL/TP from the entry when a short position is open", () => {
    const { lines, targets } = buildBotOverlays(
      qqe,
      { ...emptyState, paper_position: { szi: -2, entryPx: 200 } },
      [],
      200
    )
    const byId = new Map(lines.map((line) => [line.id, line]))
    // Short: TP below entry (−5%), SL above entry (+3%).
    expect(byId.get("take-profit")?.price).toBeCloseTo(190)
    expect(byId.get("take-profit")?.lineStyle).toBe("solid")
    expect(byId.get("stop-loss")?.price).toBeCloseTo(206)
    // Dragging the short TP down to 180 → 10% below the 200 entry.
    expect(targets["take-profit"].toValue(180, 200)).toBe("10")
  })

  it("inverts a momentum trailing-stop drag against the live mark", () => {
    const { lines, targets } = buildBotOverlays(
      momentumTrailing,
      emptyState,
      [],
      100
    )
    const byId = new Map(lines.map((line) => [line.id, line]))
    expect(byId.get("trailing-stop")?.lineStyle).toBe("dashed")
    // Drop at 97 with mark 100 → 3% trail; empty (skip) when the mark is 0.
    expect(targets["trailing-stop"].toValue(97, 100)).toBe("3")
    expect(targets["trailing-stop"].toValue(97, 0)).toBe("")
  })

  it("offers no drag targets for copy bots", () => {
    const copy: StrategyParams = {
      strategyType: "copy",
      sourceAddress: "0x0000000000000000000000000000000000000000",
      sizeMode: "ratio",
      ratio: 1,
      maxSlippageBps: 50,
    }
    const { targets } = buildBotOverlays(copy, emptyState, [], 100)
    expect(Object.keys(targets)).toHaveLength(0)
  })
})

describe("buildBotChartMenuItems — only offers unset levels", () => {
  it("offers both grid levels when unset, neither when set", () => {
    const unset: StrategyParams = { ...grid, takeProfitPx: "", stopLossPx: "" }
    const items = buildBotChartMenuItems(unset, emptyState, 1500, 1600)
    expect(items.map((i) => i.key)).toEqual(["takeProfitPx", "stopLossPx"])
    // The clicked price flows straight through as the absolute level.
    expect(items[0].value).toBe("1600")

    expect(buildBotChartMenuItems(grid, emptyState, 1500, 1600)).toHaveLength(0)
  })

  it("offers only the optional stop for DCA (take profit is required)", () => {
    const noStop: StrategyParams = { ...dcaLong, stopLossPct: undefined }
    const items = buildBotChartMenuItems(noStop, emptyState, 100, 90)
    expect(items.map((i) => i.key)).toEqual(["stopLossPct"])
    expect(items[0].value).toBe("10") // 90 is 10% off the 100 mark
  })

  it("hides the QQE stop when a swing stop overrides it", () => {
    const swing: StrategyParams = {
      ...qqe,
      takeProfitPct: undefined,
      stopLossPct: undefined,
      swingStopLoss: true,
    }
    const items = buildBotChartMenuItems(swing, emptyState, 200, 210)
    // Take profit still offerable; stop suppressed by the swing override.
    expect(items.map((i) => i.key)).toEqual(["takeProfitPct"])
  })

  it("offers a momentum trailing stop only in trailing mode when unset", () => {
    const noTrail: StrategyParams = {
      ...momentumTrailing,
      trailingStopPct: undefined,
    }
    expect(
      buildBotChartMenuItems(noTrail, emptyState, 100, 97).map((i) => i.key)
    ).toEqual(["trailingStopPct"])

    // Already set → nothing to add.
    expect(
      buildBotChartMenuItems(momentumTrailing, emptyState, 100, 97)
    ).toHaveLength(0)
  })

  it("offers nothing for copy bots", () => {
    const copy: StrategyParams = {
      strategyType: "copy",
      sourceAddress: "0x0000000000000000000000000000000000000000",
      sizeMode: "ratio",
      ratio: 1,
      maxSlippageBps: 50,
    }
    expect(buildBotChartMenuItems(copy, emptyState, 100, 90)).toHaveLength(0)
  })
})
