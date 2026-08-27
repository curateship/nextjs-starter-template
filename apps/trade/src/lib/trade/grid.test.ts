import { describe, expect, it } from "vitest"

import {
  defaultGridParams,
  gridEndPx,
  gridFollowDownShift,
  gridFollowShift,
  gridLevels,
  gridLevelSize,
  gridOrderPlan,
  placeGridParamsSchema,
  gridRangeFromClick,
  gridShares,
  gridStepPct,
  gridRangeMovable,
  gridStopLegPrices,
  gridStopPx,
  isGridStopLeg,
  type GridLevelState,
  type GridPlan,
  gridStopUnder,
  gridTakeProfitPx,
} from "./grid"
import { readSmartPlan } from "./smart-plan"

describe("gridLevels", () => {
  it("puts the deepest buy on the bottom and the shallowest sell on the top", () => {
    const levels = gridLevels({
      topPx: 120,
      bottomPx: 80,
      levels: 4,
      spacing: "even",
    })
    expect(levels).toHaveLength(4)
    // The range means exactly what it says at both ends.
    expect(levels[0].buyPx).toBeCloseTo(80, 9)
    expect(levels[3].sellPx).toBeCloseTo(120, 9)
  })

  it("puts the same dollars between every level when spread evenly", () => {
    const levels = gridLevels({
      topPx: 120,
      bottomPx: 80,
      levels: 4,
      spacing: "even",
    })
    // (120 − 80) / 4 = 10 a step.
    expect(levels.map((one) => one.buyPx)).toEqual([80, 90, 100, 110])
    for (const level of levels) {
      expect(level.sellPx - level.buyPx).toBeCloseTo(10, 9)
    }
  })

  it("sells one step above its own buy, never above the level above it", () => {
    const levels = gridLevels({
      topPx: 120,
      bottomPx: 80,
      levels: 4,
      spacing: "even",
    })
    for (const [index, level] of levels.entries()) {
      const above = levels[index + 1]
      // Which happens to be the same price as the next buy on an even grid —
      // but it is derived from its OWN buy, which is what a recycle needs.
      expect(level.sellPx).toBeCloseTo(above ? above.buyPx : 120, 9)
    }
  })

  it("puts the same percent between every level when spread by percent", () => {
    const levels = gridLevels({
      topPx: 160,
      bottomPx: 10,
      levels: 4,
      spacing: "compounding",
    })
    const steps = levels.map((one) => one.sellPx / one.buyPx)
    for (const step of steps) expect(step).toBeCloseTo(steps[0], 9)
    expect(levels[0].buyPx).toBeCloseTo(10, 9)
    expect(levels[3].sellPx).toBeCloseTo(160, 9)
  })

  it("draws nothing when the range is upside down or worthless", () => {
    expect(
      gridLevels({ topPx: 80, bottomPx: 120, levels: 4, spacing: "even" })
    ).toEqual([])
    expect(
      gridLevels({ topPx: 120, bottomPx: 0, levels: 4, spacing: "even" })
    ).toEqual([])
  })

  it("measures the step at the top of the range, where it is thinnest", () => {
    const levels = gridLevels({
      topPx: 120,
      bottomPx: 80,
      levels: 4,
      spacing: "even",
    })
    // 10 on a buy of 110, not 10 on a buy of 80 — checking the fattest step
    // would pass a grid whose upper levels all lose money.
    expect(gridStepPct(levels)).toBeCloseTo(10 / 110, 9)
  })
})

describe("gridOrderPlan", () => {
  const params = {
    ...defaultGridParams(),
    levels: 4,
    potPct: 20,
    maxOrderVolPct: 0,
  }

  it("splits the pot evenly, not on a ramp", () => {
    const plan = gridOrderPlan({
      topPx: 120,
      bottomPx: 80,
      equity: 10_000,
      params,
      sizeDecimals: 4,
      volume24hUsd: null,
    })
    // 20% of $10,000 is $2,000, over four levels: $500 each.
    for (const level of plan.levels) {
      expect(level.dollars).toBeCloseTo(500, 1)
    }
    expect(plan.totalCost).toBeCloseTo(2000, 1)
  })

  it("uses borrowing to buy more coin without changing the account share", () => {
    const plan = gridOrderPlan({
      topPx: 120,
      bottomPx: 80,
      equity: 10_000,
      params: { ...params, leverage: 3 },
      sizeDecimals: 4,
      volume24hUsd: null,
    })
    // The grid still puts 20% of the account behind the range. At 3x that
    // $2,000 buys $6,000 of coin, split evenly between the four levels.
    for (const level of plan.levels) {
      expect(level.dollars).toBeCloseTo(1_500, 1)
    }
    expect(plan.totalCost).toBeCloseTo(6_000, 1)
  })

  it("shrinks a buy that would be too big a share of the day's volume", () => {
    const plan = gridOrderPlan({
      topPx: 120,
      bottomPx: 80,
      equity: 10_000,
      params: { ...params, maxOrderVolPct: 1 },
      sizeDecimals: 4,
      // 1% of $20,000 is $200 — well under the $500 each level wanted.
      volume24hUsd: 20_000,
    })
    expect(plan.volumeCapped).toBe(true)
    for (const level of plan.levels)
      expect(level.dollars).toBeLessThanOrEqual(201)
  })

  it("flags a level too small to be an order rather than quietly dropping it", () => {
    const plan = gridOrderPlan({
      topPx: 120,
      bottomPx: 80,
      equity: 0.001,
      params,
      sizeDecimals: 0,
      volume24hUsd: null,
    })
    expect(plan.tooSmallIndex).toBe(0)
  })
})

describe("a level's money", () => {
  const level: Pick<GridLevelState, "budget" | "buyPx"> = {
    budget: 500,
    buyPx: 100,
  }

  it("spends the same dollars every cycle, however the price moved", () => {
    // The level always buys $500 of coin at its own frozen price. There is no
    // path by which a cheaper round leaves it with more to spend next time —
    // which is what would compound a fixed pot into a much larger one.
    expect(gridLevelSize(level, 4)).toBeCloseTo(5, 9)
    expect(gridLevelSize({ ...level, budget: 500 }, 4)).toBeCloseTo(5, 9)
  })

  it("never rounds a size up into more risk", () => {
    expect(gridLevelSize({ budget: 550, buyPx: 100 }, 0)).toBe(5)
  })
})

describe("gridStopPx", () => {
  const base = (
    over: Partial<GridPlan> = {}
  ): Pick<GridPlan, "stopLoss" | "bottomPx" | "baseWatch"> => ({
    bottomPx: 80,
    stopLoss: { mode: "percent", underPct: 5, px: null, base: null },
    baseWatch: null,
    ...over,
  })

  it("hangs off the bottom of the range", () => {
    expect(gridStopPx(base())).toBeCloseTo(76, 9)
  })

  it("is nothing at all when the stop is switched off", () => {
    expect(gridStopPx(base({ stopLoss: null }))).toBeNull()
  })

  it("stays where a hand put it", () => {
    expect(
      gridStopPx(
        base({ stopLoss: { mode: "fixed", underPct: 5, px: 61, base: null } })
      )
    ).toBe(61)
  })

  it("rides a base that has confirmed BELOW the range", () => {
    expect(
      gridStopPx(
        base({
          stopLoss: {
            mode: "percent",
            underPct: 5,
            px: null,
            base: { underPct: 2, reclaimDays: 1 },
          },
          baseWatch: { levelPx: 70, seenTo: 0 },
        })
      )
    ).toBeCloseTo(68.6, 9)
  })

  it("ignores a base INSIDE the range, which is somewhere it means to buy", () => {
    // A stop at 95 would sit above eight of the twelve levels and sell the
    // whole grid on the first ordinary dip.
    expect(
      gridStopPx(
        base({
          stopLoss: {
            mode: "percent",
            underPct: 5,
            px: null,
            base: { underPct: 2, reclaimDays: 1 },
          },
          baseWatch: { levelPx: 95, seenTo: 0 },
        })
      )
    ).toBeCloseTo(76, 9)
  })
})

describe("reading a stored grid back", () => {
  const plan: GridPlan = {
    topPx: 120,
    bottomPx: 80,
    takeProfitPx: null,
    spacing: "even",
    sizing: "even",
    potPct: 20,
    maxOrderVolPct: 0,
    startedAt: 1,
    sizeDecimals: 4,
    priceTick: null,
    minOrderValueUsd: 10,
    leverage: 1,
    maxLeverage: 20,
    levels: [
      {
        buyPx: 80,
        sellPx: 90,
        sz: 5,
        budget: 400,
        heldSz: 0,
        status: "waiting",
        armed: true,
        dead: false,
        cycles: 0,
      },
      {
        buyPx: 90,
        sellPx: 100,
        sz: 4,
        budget: 400,
        heldSz: 0,
        status: "waiting",
        armed: true,
        dead: false,
        cycles: 0,
      },
    ],
    carriedLevels: [],
    stopLoss: null,
    baseDetection: defaultGridParams().baseDetection,
    baseWatch: null,
    aimedSlPx: null,
    pairedStop: null,
    seenFillsTo: 0,
    cycles: 0,
    follow: false,
    followDown: false,
    entered: true,
    shifts: 0,
    downShifts: 0,
    closedReason: null,
  }

  it("reads its own back and refuses junk rather than half-obeying it", () => {
    expect(readSmartPlan("grid", plan)).toEqual(plan)
    expect(readSmartPlan("grid", null)).toBeNull()
    expect(readSmartPlan("grid", { topPx: "up" })).toBeNull()
  })

  it("reads a grid saved before borrowing as cash", () => {
    const { leverage: _leverage, ...oldPlan } = plan
    expect(readSmartPlan("grid", oldPlan)).toMatchObject({ leverage: 1 })
  })

  it("refuses a grid read as a ladder", () => {
    // A row of the wrong kind must be ignored, not half-obeyed by whichever
    // engine reached it first.
    expect(readSmartPlan("dca", plan)).toBeNull()
  })

  it("refuses a grid with fewer than two levels", () => {
    expect(
      readSmartPlan("grid", { ...plan, levels: [plan.levels[0]] })
    ).toBeNull()
  })

  it("lets the range move while the grid holds nothing", () => {
    expect(gridRangeMovable(plan)).toBe(true)
  })

  it("locks the range once a level is holding", () => {
    // That level bought at its own price and sells one step above it. Sliding
    // the range under it would leave it selling coins it never paid that price
    // for, which is the lump this order type exists to avoid.
    expect(
      gridRangeMovable({
        levels: [{ ...plan.levels[0], status: "holding" }, plan.levels[1]],
      })
    ).toBe(false)
  })

  it("has nothing to move once every level is called off", () => {
    expect(
      gridRangeMovable({
        levels: plan.levels.map((one) => ({
          ...one,
          status: "cancelled" as const,
        })),
      })
    ).toBe(false)
  })
})

/**
 * The two grid prices nothing was checking.
 *
 * Both decide where real money leaves a trade, and neither had a test.
 */
describe("where a grid's stop sits under its range", () => {
  it("is that percent below the bottom rung", () => {
    expect(gridStopUnder(100, 5)).toBeCloseTo(95, 9)
    expect(gridStopUnder(0.004, 10)).toBeCloseTo(0.0036, 12)
  })

  it("sits ON the bottom rung at zero, rather than nowhere", () => {
    expect(gridStopUnder(100, 0)).toBe(100)
  })
})

describe("a grid's End Grid line", () => {
  it("starts above the market when the whole range sits below it", () => {
    expect(gridEndPx(120, 200, 5)).toBeCloseTo(210, 9)
  })

  it("starts above the range when its top is already higher than the market", () => {
    expect(gridEndPx(120, 100, 5)).toBeCloseTo(126, 9)
  })

  it("stays fixed when a following range reaches it", () => {
    expect(gridTakeProfitPx({ takeProfitPx: 120 })).toBe(120)
    expect(gridTakeProfitPx({ takeProfitPx: 100 })).toBe(100)
  })

  it("is nothing when none was set", () => {
    expect(gridTakeProfitPx({ takeProfitPx: null })).toBeNull()
  })
})

describe("gridShares", () => {
  it("gives every level the same slice when the pot is split evenly", () => {
    const shares = gridShares(4, "even")
    expect(shares).toEqual([0.25, 0.25, 0.25, 0.25])
  })

  it("doubles each level DOWN, so the biggest lands on the bottom", () => {
    const shares = gridShares(6, "double")
    // Index 0 is the bottom of the range, which is where the money goes.
    for (const [index, share] of shares.entries()) {
      const below = shares[index + 1]
      if (below !== undefined) expect(share).toBeCloseTo(below * 2, 12)
    }
    expect(shares[0]).toBeGreaterThan(shares[5])
  })

  it("redistributes the pot rather than growing it", () => {
    for (const count of [2, 6, 12, 20]) {
      const sum = gridShares(count, "double").reduce((a, b) => a + b, 0)
      expect(sum).toBeCloseTo(1, 12)
    }
  })
})

describe("new grid requirements", () => {
  it("accepts even sizing with a stop and refuses removed choices", () => {
    expect(placeGridParamsSchema.safeParse(defaultGridParams()).success).toBe(
      true
    )
    expect(
      placeGridParamsSchema.safeParse({
        ...defaultGridParams(),
        sizing: "double",
      }).success
    ).toBe(false)
    expect(
      placeGridParamsSchema.safeParse({
        ...defaultGridParams(),
        stopLoss: null,
      }).success
    ).toBe(false)
  })
})

describe("gridOrderPlan with the pot doubled", () => {
  const params = {
    ...defaultGridParams(),
    levels: 6,
    potPct: 20,
    maxOrderVolPct: 0,
    sizing: "double" as const,
  }

  it("spends twice as much at each level down and still adds up to the pot", () => {
    const plan = gridOrderPlan({
      topPx: 120,
      bottomPx: 80,
      equity: 10_000,
      params,
      sizeDecimals: 6,
      volume24hUsd: null,
    })
    // 20% of $10,000 is $2,000 across weights 32:16:8:4:2:1 of 63.
    expect(plan.levels[0].dollars).toBeCloseTo((2000 * 32) / 63, 1)
    expect(plan.levels[5].dollars).toBeCloseTo((2000 * 1) / 63, 1)
    for (const [index, level] of plan.levels.entries()) {
      const above = plan.levels[index + 1]
      if (above) expect(level.dollars).toBeCloseTo(above.dollars * 2, 1)
    }
    expect(plan.totalCost).toBeCloseTo(2000, 1)
  })

  it("refuses at the shallow end once doubling has stretched too far", () => {
    const plan = gridOrderPlan({
      topPx: 120,
      bottomPx: 80,
      equity: 10_000,
      params: { ...params, levels: 12 },
      sizeDecimals: 6,
      volume24hUsd: null,
    })
    // Weights run 2048 down to 1 of 4095. Level 8 of 12 is the first under the
    // exchange's $10, at $7.81, and the whole grid is refused rather than
    // eight-twelfths of it placed.
    expect(plan.tooSmallIndex).toBe(7)
  })
})

describe("gridRangeFromClick", () => {
  // The whole promise of the mode: the price you clicked is a BUY, and the top
  // of the range is one step above it because that is where the buy sells.
  for (const spacing of ["even", "compounding"] as const) {
    for (const levels of [2, 6, 12, 20]) {
      it(`puts the click on the top buy — ${spacing}, ${levels} levels`, () => {
        const range = gridRangeFromClick({
          clickPx: 95,
          rangePct: 15,
          levels,
          spacing,
        })
        expect(range).not.toBeNull()
        const drawn = gridLevels({ ...range!, levels, spacing })
        expect(drawn.at(-1)!.buyPx).toBeCloseTo(95, 9)
        expect(range!.bottomPx).toBeCloseTo(80.75, 9)
        expect(range!.topPx).toBeGreaterThan(95)
      })
    }
  }

  it("refuses numbers that cannot describe a grid", () => {
    const ok = {
      clickPx: 95,
      rangePct: 15,
      levels: 6,
      spacing: "even" as const,
    }
    expect(gridRangeFromClick({ ...ok, clickPx: 0 })).toBeNull()
    expect(gridRangeFromClick({ ...ok, rangePct: 0 })).toBeNull()
    expect(gridRangeFromClick({ ...ok, rangePct: 100 })).toBeNull()
    expect(gridRangeFromClick({ ...ok, levels: 1 })).toBeNull()
  })
})

describe("gridFollowShift", () => {
  const range = {
    topPx: 120,
    bottomPx: 80,
    levels: 12,
    spacing: "even" as const,
  }

  it("moves whole steps, just far enough to clear the price", () => {
    const moved = gridFollowShift({ ...range, mark: 131 })
    // A step is (120 − 80) / 12 = 3.333, and 131 is 3.3 steps over the top.
    expect(moved?.steps).toBe(4)
    expect(moved?.topPx).toBeCloseTo(133.333, 3)
    expect(moved?.bottomPx).toBeCloseTo(93.333, 3)
  })

  it("leaves every level below the price, so nothing buys on the way", () => {
    for (const mark of [120.01, 125, 131, 200]) {
      const moved = gridFollowShift({ ...range, mark })
      const drawn = gridLevels({ ...range, ...moved!, levels: range.levels })
      expect(drawn.at(-1)!.buyPx).toBeLessThan(mark)
      expect(moved!.topPx).toBeGreaterThanOrEqual(mark)
    }
  })

  it("moves one step when price reaches the top", () => {
    expect(gridFollowShift({ ...range, mark: 120 })).toEqual({
      topPx: 120 + 40 / 12,
      bottomPx: 80 + 40 / 12,
      steps: 1,
    })
  })

  it("does not move while price is still inside the range", () => {
    expect(gridFollowShift({ ...range, mark: 100 })).toBeNull()
    expect(gridFollowShift({ ...range, mark: 79 })).toBeNull()
  })

  it("keeps the same percent between levels when they are spread that way", () => {
    const percent = { ...range, spacing: "compounding" as const }
    const before = gridStepPct(gridLevels(percent))
    const moved = gridFollowShift({ ...percent, mark: 140 })
    const after = gridStepPct(
      gridLevels({ ...percent, ...moved!, levels: percent.levels })
    )
    // Which is exactly why a percent-spread grid can follow forever: the fee
    // check reads this number, and moving up never thins it.
    expect(after).toBeCloseTo(before, 9)
  })
})

describe("gridFollowDownShift", () => {
  const range = {
    topPx: 120,
    bottomPx: 80,
    levels: 4,
    spacing: "even" as const,
  }

  it("moves exactly one level per pass however far price fell", () => {
    expect(gridFollowDownShift({ ...range, mark: 80 })).toEqual({
      topPx: 110,
      bottomPx: 70,
    })
    expect(gridFollowDownShift({ ...range, mark: 79 })).toEqual({
      topPx: 110,
      bottomPx: 70,
    })
    expect(gridFollowDownShift({ ...range, mark: 5 })).toEqual({
      topPx: 110,
      bottomPx: 70,
    })
  })

  it("does not move inside the range or below the market's lowest price", () => {
    expect(
      gridFollowDownShift({
        topPx: 15,
        bottomPx: 5,
        levels: 1,
        spacing: "even",
        mark: 4,
      })
    ).toBeNull()
  })

  it("keeps the same percent spacing", () => {
    const percent = { ...range, spacing: "compounding" as const }
    const before = gridStepPct(gridLevels(percent))
    const moved = gridFollowDownShift({ ...percent, mark: 79 })
    expect(
      gridStepPct(gridLevels({ ...percent, ...moved!, levels: percent.levels }))
    ).toBeCloseTo(before, 9)
  })
})

describe("the exchange's own copy of a grid's stop", () => {
  const plan = {
    stopLoss: { mode: "fixed" as const, px: 73.298, base: null, underPct: 5 },
    bottomPx: 78.787,
    baseWatch: null,
  }
  const grid = { walletId: "w1", marketKey: "hl:BTC", plan }
  const leg = {
    walletId: "w1",
    marketKey: "hl:BTC",
    px: 73.298,
    trigger: true as const,
  }

  it("is hidden, so the red STOP LOSS pill is the only thing at that price", () => {
    const prices = gridStopLegPrices([grid], [])
    expect(isGridStopLeg(leg, prices)).toBe(true)
  })

  it("is still hidden while the plan has moved and the leg has not", () => {
    const moved = {
      ...grid,
      plan: { ...plan, stopLoss: { ...plan.stopLoss, px: 70 } },
    }
    const position = { walletId: "w1", marketKey: "hl:BTC", slPx: 73.298 }
    const prices = gridStopLegPrices([moved], [position])
    expect(isGridStopLeg(leg, prices)).toBe(true)
    expect(isGridStopLeg({ ...leg, px: 70 }, prices)).toBe(true)
  })

  it("leaves every other order alone", () => {
    const prices = gridStopLegPrices([grid], [])
    // A resting order at the same price is not the stop leg.
    expect(isGridStopLeg({ ...leg, trigger: undefined }, prices)).toBe(false)
    // A trigger at another price is one of the grid's sells.
    expect(isGridStopLeg({ ...leg, px: 85.79 }, prices)).toBe(false)
    // A trigger on a market no grid is running.
    expect(isGridStopLeg({ ...leg, marketKey: "hl:ETH" }, prices)).toBe(false)
    // Another wallet's stop at the same price.
    expect(isGridStopLeg({ ...leg, walletId: "w2" }, prices)).toBe(false)
  })
})
