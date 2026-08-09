import { describe, expect, it } from "vitest"

import {
  dcaAllocationPcts,
  dcaLadderPlan,
  dcaLevels,
  dcaParamsSchema,
  defaultDcaParams,
  ladderBaseStopOf,
  ladderExitLevels,
  ladderFirstBuyPx,
  baseStopPx,
  readLadderPlan,
  rungBudget,
  type LadderPlan,
  type LadderRungState,
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
    // 100 itself is allowed now — it is how a base stop says "nothing until
    // the base arrives". Anything past it is still nonsense.
    ["a stop over 100%", { stopLoss: { pct: 101 } }],
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
    anchor: "click",
    sizeDecimals: 3,
    maxLeverage: 50,
    rungs: [
      {
        px: 95,
        sz: 1,
        budget: 95,
        status: "waiting",
        orderId: null,
        sellOrderId: null,
        dead: false,
        touched: false,
      },
      {
        px: 87.4,
        sz: 2,
        budget: 174.8,
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
    steppedDown: 0,
    baseWatch: null,
    reclaim: null,
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

describe("the stop that rests under the base", () => {
  const rung = (px: number, sz: number, status: LadderRungState["status"]) => ({
    px,
    sz,
    budget: px * sz,
    status,
    orderId: null,
    sellOrderId: null,
    dead: false,
    touched: false,
  })

  const withStop = (
    rungs: LadderRungState[],
    base: { underPct: number } | null
  ) => ({
    rungs,
    stopLoss: {
      mode: "percent" as const,
      pct: 100,
      base: base
        ? { ...base, reclaimDays: 1, searchBars: 36, holdBars: 8 }
        : null,
    },
  })

  it("rests on the level, and the chosen percent under it", () => {
    const held = [rung(95, 1, "filled")]
    expect(baseStopPx(withStop(held, { underPct: 0 }), 90)).toBeCloseTo(90, 9)
    expect(baseStopPx(withStop(held, { underPct: 2 }), 90)).toBeCloseTo(88.2, 9)
  })

  it("refuses a level above what is held — that is a target, not a stop", () => {
    const held = [rung(87.4, 1, "filled")]
    expect(baseStopPx(withStop(held, { underPct: 0 }), 90)).toBeNull()
  })

  it("counts only rungs still held, so a stopped-out round cannot arm the next", () => {
    // Rung 1 was sold at a stop and rung 2 has just bought. A base of 90 is
    // above what is held now, so it must not become the new rung's stop.
    const rungs = [rung(95, 1, "sold"), rung(87.4, 2, "filled")]
    expect(ladderFirstBuyPx({ rungs })).toBeCloseTo(87.4, 9)
    expect(baseStopPx(withStop(rungs, { underPct: 0 }), 90)).toBeNull()
  })

  it("says nothing at all before a base has confirmed, or with the rule off", () => {
    const held = [rung(95, 1, "filled")]
    expect(baseStopPx(withStop(held, { underPct: 0 }), null)).toBeNull()
    expect(baseStopPx(withStop(held, null), 90)).toBeNull()
  })

  it("freezes the chart's own base settings onto the ladder", () => {
    expect(ladderBaseStopOf({ underPct: 1, reclaimDays: 1 })).toEqual({
      underPct: 1,
      reclaimDays: 1,
      searchBars: 36,
      holdBars: 8,
    })
    expect(ladderBaseStopOf(null)).toBeNull()
  })

  it("caps a buy-back at the budget the rung was placed with, not what it holds", () => {
    // A rung bought back cheaper holds more coins. Its budget must not follow,
    // or every round of stop-and-reclaim would spend more than the last.
    const bought = { ...rung(95, 1, "filled"), sz: 3 }
    expect(rungBudget(bought)).toBeCloseTo(95, 9)
    // A ladder placed before budgets existed falls back to what it holds.
    expect(rungBudget({ ...bought, budget: 0 })).toBeCloseTo(285, 9)
  })

  it("keeps a 100% stop, which is how you say no stop until the base arrives", () => {
    const asked = defaultDcaParams()
    asked.stopLoss = { pct: 100, base: { underPct: 0, reclaimDays: 1 } }
    expect(dcaParamsSchema.safeParse(asked).success).toBe(true)
    asked.stopLoss = { pct: 101, base: null }
    expect(dcaParamsSchema.safeParse(asked).success).toBe(false)
  })
})
