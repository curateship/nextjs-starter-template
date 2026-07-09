import { describe, expect, it } from "vitest"

import { buildBotChartLines } from "./bot-chart-lines"
import { gridParamsSchema, type StrategyParams } from "@/lib/strategies/params"

const gridParams: StrategyParams = {
  strategyType: "grid",
  lowerPx: "1000",
  upperPx: "2000",
  levels: 11,
  sizePerLevelUsd: 100,
  side: "both",
  stopLossPx: "800",
  takeProfitPx: "2400",
}

const emptyState = {
  market: "ETH",
  status: "running",
  status_reason: null,
  strategy_state: {},
  paper_position: null,
  paper_cash: null,
  daily_realized_pnl: 0,
  consecutive_losses: 0,
  cooldown_until: null,
  peak_equity: null,
  last_eval_at: null,
}

describe("buildBotChartLines — grid", () => {
  it("draws bounds, interior levels, TP and SL", () => {
    const lines = buildBotChartLines(gridParams, emptyState, [])
    const byId = new Map(lines.map((line) => [line.id, line]))

    expect(byId.get("grid-upper")?.price).toBe(2000)
    expect(byId.get("grid-upper")?.title).toBe("Upper price")
    expect(byId.get("grid-lower")?.price).toBe(1000)
    expect(byId.get("take-profit")?.price).toBe(2400)
    expect(byId.get("take-profit")?.color).toBe("#089981")
    expect(byId.get("stop-loss")?.price).toBe(800)

    // 11 levels → 9 interior dashed lines at 1100..1900, no axis labels.
    const interior = lines.filter((line) => line.id.startsWith("grid-level-"))
    expect(interior).toHaveLength(9)
    expect(interior[0].price).toBeCloseTo(1100)
    expect(interior[8].price).toBeCloseTo(1900)
    expect(interior.every((line) => line.axisLabelVisible === false)).toBe(true)
  })

  it("draws resting orders and paper entry", () => {
    const lines = buildBotChartLines(
      gridParams,
      { ...emptyState, paper_position: { szi: 0.5, entryPx: 1500 } },
      [
        { id: "a", market: "ETH", side: "buy", px: "1400", sz: "0.1", purpose: "grid:4:buy", status: "resting" },
        { id: "b", market: "ETH", side: "sell", px: "1600", sz: "0.1", purpose: "grid:6:sell", status: "resting" },
      ]
    )
    const byId = new Map(lines.map((line) => [line.id, line]))
    expect(byId.get("entry")?.price).toBe(1500)
    expect(byId.get("bot-order-a")?.color).toBe("#089981")
    expect(byId.get("bot-order-b")?.color).toBe("#f23645")
    expect(byId.get("bot-order-b")?.title).toBe("Sell 0.1")
  })
})

describe("buildBotChartLines — dca", () => {
  it("ladders safety levels from the anchor and shows TP from avg entry", () => {
    const params: StrategyParams = {
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
    const lines = buildBotChartLines(
      params,
      {
        ...emptyState,
        strategy_state: { anchorPx: 100 },
        paper_position: { szi: 1, entryPx: 99 },
      },
      []
    )
    const byId = new Map(lines.map((line) => [line.id, line]))
    // deviations: 1%, 1+2=3%, 3+4=7%
    expect(byId.get("dca-safety-1")?.price).toBeCloseTo(99)
    expect(byId.get("dca-safety-2")?.price).toBeCloseTo(97)
    expect(byId.get("dca-safety-3")?.price).toBeCloseTo(93)
    expect(byId.get("stop-loss")?.price).toBeCloseTo(90)
    expect(byId.get("take-profit")?.price).toBeCloseTo(99 * 1.02)
  })
})

describe("grid takeProfitPx param", () => {
  it("accepts and validates the new field", () => {
    expect(gridParamsSchema.safeParse(gridParams).success).toBe(true)
    expect(
      gridParamsSchema.safeParse({ ...gridParams, takeProfitPx: "-5" }).success
    ).toBe(false)
  })
})
