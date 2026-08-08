import { describe, expect, it } from "vitest"

import {
  dcaAllocationPcts,
  dcaLadderPlan,
  dcaLevels,
  dcaParamsSchema,
  defaultDcaParams,
  ladderExitLevels,
  readLadderPlan,
  type LadderPlan,
} from "./dca"

describe("dcaLevels", () => {
  it("compounds each step off the buy above, not the click", () => {
    const levels = dcaLevels(100, [{ deviation: 5 }, { deviation: 8 }])
    expect(levels[0]).toBeCloseTo(95, 10)
    expect(levels[1]).toBeCloseTo(87.4, 10)
  })

  it("is empty for no rungs", () => {
    expect(dcaLevels(100, [])).toEqual([])
  })
})

describe("dcaAllocationPcts", () => {
  it("always sums to the pot", () => {
    const shares = dcaAllocationPcts(5, 25, 2)
    expect(shares.reduce((sum, one) => sum + one, 0)).toBeCloseTo(25, 10)
  })

  it("splits equally at ramp 1", () => {
    expect(dcaAllocationPcts(4, 20, 1)).toEqual([5, 5, 5, 5])
  })

  it("doubles each share at ramp 2", () => {
    const [a, b, c] = dcaAllocationPcts(3, 70, 2)
    expect(b).toBeCloseTo(a * 2, 10)
    expect(c).toBeCloseTo(a * 4, 10)
    expect(a).toBeCloseTo(10, 10)
  })
})

describe("dcaParamsSchema", () => {
  it("accepts the defaults", () => {
    expect(dcaParamsSchema.safeParse(defaultDcaParams()).success).toBe(true)
  })

  it.each([
    ["no rungs", { rungs: [] }],
    [
      "21 rungs",
      { rungs: Array.from({ length: 21 }, () => ({ deviation: 5 })) },
    ],
    ["a zero step", { rungs: [{ deviation: 0 }] }],
    ["a 100% step", { rungs: [{ deviation: 100 }] }],
    ["a ramp under 1", { sizeMultiplier: 0.5 }],
    ["a ramp over 10", { sizeMultiplier: 11 }],
    ["a pot over 100", { maxPositionPct: 101 }],
    ["a zero target", { takeProfit: { mode: "average", pct: 0 } }],
    ["a 100% stop", { stopLoss: { pct: 100 } }],
    ["a volume guard over 5", { maxOrderVolPct: 6 }],
  ])("refuses %s", (_name, override) => {
    const params = { ...defaultDcaParams(), ...override }
    expect(dcaParamsSchema.safeParse(params).success).toBe(false)
  })
})

describe("dcaLadderPlan", () => {
  const params = {
    rungs: [{ deviation: 5 }, { deviation: 8 }],
    maxPositionPct: 20,
    sizeMultiplier: 2,
    maxOrderVolPct: 0,
  }

  it("prices, funds and sizes every rung from the same arithmetic", () => {
    const plan = dcaLadderPlan({
      anchorPx: 100,
      equity: 10_000,
      params,
      sizeDecimals: 3,
      volume24hUsd: null,
    })
    // Shares: 20% split 1:2 → $666.67 and $1,333.33; sizes floored to 3dp.
    expect(plan.rungs[0].px).toBeCloseTo(95, 10)
    expect(plan.rungs[0].sz).toBeCloseTo(7.017, 10)
    expect(plan.rungs[1].px).toBeCloseTo(87.4, 10)
    expect(plan.rungs[1].sz).toBeCloseTo(15.255, 10)
    expect(plan.totalCost).toBeCloseTo(
      plan.rungs[0].px * plan.rungs[0].sz + plan.rungs[1].px * plan.rungs[1].sz,
      10
    )
    expect(plan.tooSmallIndex).toBeNull()
    expect(plan.volumeCapped).toBe(false)
  })

  it("flags a rung that rounds to nothing instead of skipping it", () => {
    const plan = dcaLadderPlan({
      anchorPx: 100,
      equity: 10,
      params,
      // Whole coins only, and the shares here buy far less than one.
      sizeDecimals: 0,
      volume24hUsd: null,
    })
    expect(plan.tooSmallIndex).toBe(0)
    expect(plan.rungs).toHaveLength(2)
  })

  it("caps a buy at the liquidity guard and says so", () => {
    const plan = dcaLadderPlan({
      anchorPx: 100,
      equity: 10_000,
      params: { ...params, maxOrderVolPct: 1 },
      sizeDecimals: 3,
      // 1% of $50,000 = $500 — under the second rung's $1,333 share.
      volume24hUsd: 50_000,
    })
    expect(plan.volumeCapped).toBe(true)
    expect(plan.rungs[1].dollars).toBeLessThanOrEqual(500 + 1e-9)
  })
})

describe("ladder plans", () => {
  const plan: LadderPlan = {
    anchorPx: 100,
    sizeDecimals: 3,
    maxLeverage: 50,
    rungs: [
      {
        px: 95,
        sz: 1,
        status: "waiting",
        orderId: null,
        sellOrderId: null,
        dead: false,
        touched: false,
      },
      {
        px: 87.4,
        sz: 2,
        status: "waiting",
        orderId: null,
        sellOrderId: null,
        dead: false,
        touched: false,
      },
    ],
    takeProfit: { mode: "prevRung", pct: null },
    stopLoss: null,
    aimedTpPx: null,
    aimedSlPx: null,
    twoGreen: false,
    greenInterval: null,
    green: null,
  }

  it("exits each rung at the rung above it, the first at the click", () => {
    expect(ladderExitLevels(plan)).toEqual([100, 95])
  })

  it("reads a stored plan back, and refuses junk rather than half-obeying it", () => {
    expect(readLadderPlan(plan)).toEqual(plan)
    expect(readLadderPlan(null)).toBeNull()
    expect(readLadderPlan({ anchorPx: "up" })).toBeNull()
  })
})
