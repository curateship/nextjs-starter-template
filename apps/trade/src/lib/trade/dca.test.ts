import { describe, expect, it } from "vitest"

import {
  dcaAllocationPcts,
  DEFAULT_DCA_RUNGS,
  nextDcaRung,
  dcaLadderPlan,
  dcaLevels,
  dcaParamsSchema,
  defaultDcaParams,
  ladderPlanSchema,
  ladderBaseStopOf,
  ladderExitLevels,
  ladderFirstBuyPx,
  baseStopPx,
  rungBudget,
  floorSize,
  volumeCapUsd,
  sizeOneOrder,
  MAX_BASE_STOP_RECLAIM_DAYS,
  MAX_BASE_STOP_UNDER_PCT,
  type LadderPlan,
  type LadderRungState,
} from "./dca"
import { readSmartPlan } from "./smart-plan"

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

  it("keeps saved ladders compounding when the setting is missing", () => {
    const { compound: _compound, ...saved } = defaultDcaParams()
    expect(dcaParamsSchema.parse(saved).compound).toBe(true)
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
    ["fractional borrowing", { leverage: 2.5 }],
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
    leverage: 1,
  }

  it("buys twice as much coin at 2x, out of the same slice of the pot", () => {
    // The whole of what borrowing means here. "20% per coin" still sets aside
    // 20% — $2,000 of a $10,000 pot — and that $2,000 now holds $4,000 of coin.
    const cash = dcaLadderPlan({
      anchorPx: 100,
      equity: 10_000,
      params,
      sizeDecimals: 3,
      volume24hUsd: null,
    })
    const borrowed = dcaLadderPlan({
      anchorPx: 100,
      equity: 10_000,
      params: { ...params, leverage: 2 },
      sizeDecimals: 3,
      volume24hUsd: null,
    })

    expect(cash.totalCost).toBeCloseTo(2_000, 0)
    expect(borrowed.totalCost).toBeCloseTo(4_000, 0)
    // Same prices, same shape — only the amount at each rung moved.
    expect(borrowed.rungs.map((one) => one.px)).toEqual(
      cash.rungs.map((one) => one.px)
    )
    for (const [index, rung] of borrowed.rungs.entries()) {
      // Not exact: each size is floored to the market's own step, so doubling
      // then flooring is a thousandth off flooring then doubling.
      expect(rung.sz).toBeCloseTo(cash.rungs[index].sz * 2, 2)
    }
  })

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
    rungEntry: "limit",
    baseDetection: {
      searchBars: 36,
      holdBars: 8,
      withTrendOnly: true,
      minBarsApart: 20,
    },
    cascade: null,
    cascadeSeenAt: null,
    entryLimit: null,
    startedAt: 0,
    sizeDecimals: 3,
    priceTick: null,
    maxLeverage: 50,
    leverage: 1,
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
    awaitingSteppedRung: false,
    awaitingRungAfterWipe: false,
    baseWatch: null,
    reclaim: null,
  }

  it("exits each rung at the rung above it, the first at the click", () => {
    expect(ladderExitLevels(plan)).toEqual([100, 95])
  })

  it("reads a stored plan back, and refuses junk rather than half-obeying it", () => {
    expect(readSmartPlan("dca", plan)).toEqual(plan)
    expect(readSmartPlan("dca", null)).toBeNull()
    expect(readSmartPlan("dca", { anchorPx: "up" })).toBeNull()
    // A ladder is not a grid. Reading one as the other has to fail, or a row
    // of the wrong kind would be half-obeyed by whichever engine got to it.
    expect(readSmartPlan("grid", plan)).toBeNull()
  })

  it("uses the public base-stop limits when it reads a stored plan", () => {
    const atLimit = {
      ...plan,
      stopLoss: {
        mode: "percent" as const,
        pct: 5,
        base: {
          underPct: MAX_BASE_STOP_UNDER_PCT,
          reclaimDays: MAX_BASE_STOP_RECLAIM_DAYS,
        },
      },
    }
    expect(ladderPlanSchema.safeParse(atLimit).success).toBe(true)
    expect(
      ladderPlanSchema.safeParse({
        ...atLimit,
        stopLoss: {
          ...atLimit.stopLoss,
          base: {
            ...atLimit.stopLoss.base,
            reclaimDays: MAX_BASE_STOP_RECLAIM_DAYS + 1,
          },
        },
      }).success
    ).toBe(false)
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

  it("keeps the stop's own two settings and nothing else", () => {
    // How a base is FOUND lives on the plan, once, for the whole ladder. The
    // stop used to keep a second copy, which is how one ladder came to hold
    // two answers to "where is the floor".
    expect(ladderBaseStopOf({ underPct: 1, reclaimDays: 1 })).toEqual({
      underPct: 1,
      reclaimDays: 1,
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

describe("adding a rung to a ladder", () => {
  it("keeps getting deeper instead of repeating the last step", () => {
    // Copying the last rung gave 5, 8, 11, 14, 17, 17, 17 — the ladder stopped
    // deepening exactly where the deep rungs matter most.
    const rungs = [...DEFAULT_DCA_RUNGS]
    for (let i = 0; i < 3; i += 1) rungs.push(nextDcaRung(rungs))
    const added = rungs.slice(5).map((r) => r.deviation)

    expect(added).toEqual([21, 26, 32])
    // Every gap wider than the one before it — that is what "exponential" buys.
    const gaps = rungs.map((r, i) =>
      i === 0 ? 0 : r.deviation - rungs[i - 1].deviation
    )
    expect(gaps.at(-1)).toBeGreaterThan(gaps.at(-2)!)
  })

  it("uses the default ladder's own first step when there is only one rung", () => {
    expect(nextDcaRung([{ deviation: 5 }])).toEqual({ deviation: 8 })
  })

  it("still deepens a ladder whose rungs are all the same", () => {
    expect(
      nextDcaRung([{ deviation: 10 }, { deviation: 10 }]).deviation
    ).toBeGreaterThan(10)
  })

  it("never sends a rung past 99 percent below", () => {
    expect(nextDcaRung([{ deviation: 60 }, { deviation: 90 }]).deviation).toBe(
      99
    )
  })
})

/**
 * The arithmetic that turns dollars into coins.
 *
 * Every rung, on every ladder, on every run passes through here — so a rounding
 * mistake in it is not one wrong trade, it is every number on the results page
 * being slightly untrue with nothing on screen to show it. None of these three
 * had a test.
 */
describe("rounding a size to the market's step", () => {
  it("always rounds DOWN, never up into more risk", () => {
    expect(floorSize(1.999, 0)).toBe(1)
    expect(floorSize(1.999, 2)).toBe(1.99)
    expect(floorSize(1.999, 3)).toBe(1.999)
  })

  it("treats a market with no stated step as whole coins", () => {
    // Not "any precision". A null step is the exchange not saying, and buying
    // 1.9 of something that only trades in whole units is an order it would
    // refuse.
    expect(floorSize(1.9, null)).toBe(1)
  })

  it("is nothing for anything that is not a real positive size", () => {
    expect(floorSize(0, 3)).toBe(0)
    expect(floorSize(-5, 3)).toBe(0)
    expect(floorSize(Number.NaN, 3)).toBe(0)
    expect(floorSize(Number.POSITIVE_INFINITY, 3)).toBe(0)
  })
})

describe("the liquidity guard's ceiling", () => {
  it("is that share of the coin's daily volume, in dollars", () => {
    expect(volumeCapUsd(0.2, 50_000_000)).toBeCloseTo(100_000, 9)
    expect(volumeCapUsd(5, 1_000)).toBeCloseTo(50, 9)
  })

  it("is off at zero, which is what off means", () => {
    expect(volumeCapUsd(0, 50_000_000)).toBeNull()
  })

  it("is off — not zero — when the exchange gave no volume", () => {
    // Null here means "nothing caps this". Returning 0 instead would cap every
    // buy at nothing and silently stop a coin trading at all.
    expect(volumeCapUsd(0.2, null)).toBeNull()
    expect(volumeCapUsd(0.2, 0)).toBeNull()
  })
})

describe("sizing one order", () => {
  it("reports what it will ACTUALLY spend, not what it wanted", () => {
    // 100 dollars at 3 each is 33.33 coins, floored to 33 — which is 99, not
    // 100. Reporting the ask would overstate the money at work on every rung.
    const sized = sizeOneOrder({
      px: 3,
      wantedUsd: 100,
      capUsd: null,
      sizeDecimals: 0,
    })
    expect(sized.sz).toBe(33)
    expect(sized.dollars).toBeCloseTo(99, 9)
    expect(sized.capped).toBe(false)
    expect(sized.tooSmall).toBe(false)
  })

  it("shrinks to the guard and says it was shrunk", () => {
    const sized = sizeOneOrder({
      px: 1,
      wantedUsd: 5_000,
      capUsd: 400,
      sizeDecimals: 2,
    })
    expect(sized.dollars).toBeCloseTo(400, 9)
    expect(sized.capped).toBe(true)
  })

  it("does not claim it was capped when the guard never bit", () => {
    const sized = sizeOneOrder({
      px: 1,
      wantedUsd: 100,
      capUsd: 400,
      sizeDecimals: 2,
    })
    expect(sized.capped).toBe(false)
  })

  it("flags an order under the exchange's dollar minimum", () => {
    // $9 of a $1 coin is a real size and still not an order anybody can send.
    expect(
      sizeOneOrder({ px: 1, wantedUsd: 9, capUsd: null, sizeDecimals: 2 })
        .tooSmall
    ).toBe(true)
    expect(
      sizeOneOrder({ px: 1, wantedUsd: 11, capUsd: null, sizeDecimals: 2 })
        .tooSmall
    ).toBe(false)
  })

  it("flags a size that rounds away to nothing", () => {
    const sized = sizeOneOrder({
      px: 1_000_000,
      wantedUsd: 100,
      capUsd: null,
      sizeDecimals: 0,
    })
    expect(sized.sz).toBe(0)
    expect(sized.dollars).toBe(0)
    expect(sized.tooSmall).toBe(true)
  })

  it("spends nothing on a market with no usable price", () => {
    const sized = sizeOneOrder({
      px: 0,
      wantedUsd: 100,
      capUsd: null,
      sizeDecimals: 2,
    })
    expect(sized.sz).toBe(0)
    expect(sized.dollars).toBe(0)
    expect(sized.tooSmall).toBe(true)
  })
})
