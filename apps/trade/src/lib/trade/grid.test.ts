import { describe, expect, it } from "vitest"

import {
  defaultGridParams,
  gridEndPx,
  gridEvenRungPcts,
  gridFlippedPcts,
  gridLevelPctsFromRows,
  gridLevels,
  gridLevelSize,
  gridLiquidationPx,
  gridManualPcts,
  gridOrderPlan,
  gridRangeAfterMove,
  gridRangeEndMovable,
  gridRangeFromClick,
  gridRangeReshapable,
  gridRowLevelIndex,
  gridRowPctsFromLevels,
  gridRowRungNumber,
  gridRungNumber,
  gridRungPctsFit,
  gridRungRowsWithLargestFurthest,
  gridRungPctsSum,
  gridShares,
  gridShiftAway,
  gridShiftInto,
  gridStepPct,
  gridStopBeyond,
  gridStopLegPrices,
  gridStopPx,
  gridTakeProfitPx,
  isGridStopLeg,
  placeGridParamsSchema,
  plannedGridReversal,
  readGridPlan,
  type GridLevelState,
  type GridPlan,
} from "./grid"
import { readSmartPlan } from "./smart-plan"

describe("gridLevels", () => {
  it("puts the deepest buy on the bottom and the shallowest sell on the top", () => {
    const levels = gridLevels({
      direction: "long",
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
      direction: "long",
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
      direction: "long",
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
      direction: "long",
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
      gridLevels({
        direction: "long",
        topPx: 80,
        bottomPx: 120,
        levels: 4,
        spacing: "even",
      })
    ).toEqual([])
    expect(
      gridLevels({
        direction: "long",
        topPx: 120,
        bottomPx: 0,
        levels: 4,
        spacing: "even",
      })
    ).toEqual([])
  })

  it("measures the step at the top of the range, where it is thinnest", () => {
    const levels = gridLevels({
      direction: "long",
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
  ): Pick<
    GridPlan,
    "direction" | "stopLoss" | "topPx" | "bottomPx" | "baseWatch"
  > => ({
    direction: "long",
    reverseWhenStopped: false,
    reversedFrom: null,
    reverseFailReason: null,
    topPx: 120,
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
    direction: "long",
    reverseWhenStopped: false,
    reversedFrom: null,
    reverseFailReason: null,
    topPx: 120,
    bottomPx: 80,
    takeProfitPx: null,
    spacing: "even",
    sizing: "even",
    manualSizing: false,
    manualRungPcts: null,
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
    expect(gridRangeEndMovable(plan, "top")).toBe(true)
    expect(gridRangeEndMovable(plan, "bottom")).toBe(true)
  })

  it("compresses around one open entry but does not re-slice it", () => {
    const held = {
      ...plan,
      levels: [
        plan.levels[0],
        { ...plan.levels[1], status: "holding" as const },
      ],
    }
    expect(gridRangeEndMovable(held, "top")).toBe(true)
    expect(gridRangeReshapable(held)).toBe(false)
    expect(gridRangeAfterMove(held, { end: "top", px: 110 })).toEqual({
      topPx: 110,
      bottomPx: 70,
    })
    const moved = gridRangeAfterMove(held, { end: "top", px: 110 })
    expect(
      gridLevels({
        ...moved!,
        levels: held.levels.length,
        spacing: held.spacing,
        direction: held.direction,
      })[1].buyPx
    ).toBe(90)
  })

  it("keeps a percent-spaced open entry fixed", () => {
    const held = {
      ...plan,
      topPx: 100,
      bottomPx: 81,
      spacing: "compounding" as const,
      levels: [
        { ...plan.levels[0], buyPx: 81, sellPx: 90 },
        {
          ...plan.levels[1],
          buyPx: 90,
          sellPx: 100,
          status: "holding" as const,
        },
      ],
    }
    const moved = gridRangeAfterMove(held, { end: "top", px: 121 })
    expect(moved?.topPx).toBe(121)
    const levels = gridLevels({
      ...moved!,
      levels: held.levels.length,
      spacing: held.spacing,
      direction: held.direction,
    })
    expect(levels[1].buyPx).toBeCloseTo(90, 9)
  })

  it("keeps a selling grid's first open entry fixed", () => {
    const held = {
      ...plan,
      direction: "short" as const,
      levels: [
        {
          ...plan.levels[0],
          buyPx: 90,
          sellPx: 80,
          status: "holding" as const,
        },
        { ...plan.levels[1], buyPx: 100, sellPx: 90 },
      ],
    }
    const moved = gridRangeAfterMove(held, { end: "bottom", px: 70 })
    expect(moved).toEqual({ topPx: 110, bottomPx: 70 })
    expect(
      gridLevels({
        ...moved!,
        levels: held.levels.length,
        spacing: held.spacing,
        direction: held.direction,
      })[0].buyPx
    ).toBe(90)
  })

  it("does not move an end that is itself the open entry", () => {
    const heldAtBottom = {
      ...plan,
      levels: [
        { ...plan.levels[0], status: "holding" as const },
        plan.levels[1],
      ],
    }
    expect(gridRangeEndMovable(heldAtBottom, "bottom")).toBe(false)
    expect(gridRangeEndMovable(heldAtBottom, "top")).toBe(true)
  })

  it("locks the range once two levels or an older range are holding", () => {
    const twoHeld = {
      ...plan,
      levels: plan.levels.map((level) => ({
        ...level,
        status: "holding" as const,
      })),
    }
    expect(gridRangeEndMovable(twoHeld, "top")).toBe(false)
    expect(gridRangeEndMovable(twoHeld, "bottom")).toBe(false)
    const carried = {
      ...plan,
      carriedLevels: [{ ...plan.levels[0], status: "holding" as const }],
    }
    expect(gridRangeEndMovable(carried, "top")).toBe(false)
    expect(gridRangeEndMovable(carried, "bottom")).toBe(false)
  })

  it("has nothing to move once every level is called off", () => {
    const cancelled = {
      ...plan,
      levels: plan.levels.map((one) => ({
        ...one,
        status: "cancelled" as const,
      })),
    }
    expect(
      gridRangeEndMovable(cancelled, "top") ||
        gridRangeEndMovable(cancelled, "bottom")
    ).toBe(false)
  })
})

/**
 * The two grid prices nothing was checking.
 *
 * Both decide where real money leaves a trade, and neither had a test.
 */
describe("where a grid's stop sits past its range", () => {
  const range = { topPx: 200, bottomPx: 100 }

  it("is that percent below the bottom rung on a buying grid", () => {
    expect(gridStopBeyond("long", range, 5)).toBeCloseTo(95, 9)
    expect(
      gridStopBeyond("long", { topPx: 0.01, bottomPx: 0.004 }, 10)
    ).toBeCloseTo(0.0036, 12)
  })

  it("is that percent ABOVE the top rung on a selling grid", () => {
    expect(gridStopBeyond("short", range, 5)).toBeCloseTo(210, 9)
    expect(
      gridStopBeyond("short", { topPx: 0.004, bottomPx: 0.001 }, 10)
    ).toBeCloseTo(0.0044, 12)
  })

  it("sits ON the losing rung at zero, rather than nowhere", () => {
    expect(gridStopBeyond("long", range, 0)).toBe(100)
    expect(gridStopBeyond("short", range, 0)).toBe(200)
  })
})

describe("a grid's End Grid line", () => {
  const range = { topPx: 120, bottomPx: 80 }

  it("starts above the market when the whole range sits below it", () => {
    expect(gridEndPx("long", range, 200, 5)).toBeCloseTo(210, 9)
  })

  it("starts above the range when its top is already higher than the market", () => {
    expect(gridEndPx("long", range, 100, 5)).toBeCloseTo(126, 9)
  })

  it("starts BELOW both on a selling grid", () => {
    // Below the market when the whole range sits above it.
    expect(gridEndPx("short", range, 50, 5)).toBeCloseTo(47.5, 9)
    // Below the range when its bottom is already lower than the market.
    expect(gridEndPx("short", range, 100, 5)).toBeCloseTo(76, 9)
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

describe("splitting the pot by hand", () => {
  /**
   * The dollars each level controls, to the nearest cent. Never to the exact
   * penny: every order is floored to the market's own size step first, so a
   * $600 rung on a coin priced in millionths comes out a hair under.
   */
  const expectDollars = (
    plan: { levels: { dollars: number }[] },
    wanted: number[]
  ) => {
    expect(plan.levels).toHaveLength(wanted.length)
    for (const [index, dollars] of wanted.entries()) {
      expect(plan.levels[index].dollars).toBeCloseTo(dollars, 3)
    }
  }

  const params = {
    ...defaultGridParams(),
    levels: 4,
    potPct: 20,
    leverage: 1,
    maxOrderVolPct: 0,
    manualSizing: true,
    // RUNG order, rung 1 first. On a buying grid rung 1 is the top of the
    // range, so this is 10% at the top down to 40% at the bottom.
    manualRungPcts: [10, 20, 30, 40],
  }

  it("gives each level the share that was typed for it", () => {
    // $10,000 × 20% = a $2,000 pot, split 40/30/20/10.
    const plan = gridOrderPlan({
      topPx: 120,
      bottomPx: 80,
      equity: 10_000,
      params,
      sizeDecimals: 6,
      volume24hUsd: null,
    })
    expectDollars(plan, [800, 600, 400, 200])
    expect(plan.totalCost).toBeCloseTo(2000, 3)
    expect(plan.tooSmallIndex).toBeNull()
  })

  it("puts each row's share at that row's price, either direction", () => {
    // The rows are held against PRICES, so the same list lands the same way
    // up whichever direction the grid runs. What mirrors a selling grid is
    // the window turning the rows over when the direction is switched.
    const plan = gridOrderPlan({
      topPx: 120,
      bottomPx: 80,
      equity: 10_000,
      params: { ...params, direction: "short" },
      sizeDecimals: 6,
      volume24hUsd: null,
    })
    expectDollars(plan, [800, 600, 400, 200])
  })

  it("borrowing multiplies the money, never the shares", () => {
    const plan = gridOrderPlan({
      topPx: 120,
      bottomPx: 80,
      equity: 10_000,
      params: { ...params, leverage: 3 },
      sizeDecimals: 6,
      volume24hUsd: null,
    })
    expectDollars(plan, [2400, 1800, 1200, 600])
  })

  it("flags the level a typed share leaves too small to be an order", () => {
    const plan = gridOrderPlan({
      topPx: 120,
      bottomPx: 80,
      equity: 500,
      // $500 × 20% = $100. The 1% rung is $1, under the $10 floor, and it
      // is rung 4 — the bottom of a buying grid's range.
      params: { ...params, manualRungPcts: [33, 33, 33, 1] },
      sizeDecimals: 6,
      volume24hUsd: null,
    })
    expect(plan.tooSmallIndex).toBe(0)
    // Level 0 is the bottom of the range: rung 4 on a buying grid.
    expect(gridRungNumber(0, 4, "long")).toBe(4)
  })

  it("still caps a typed share on a thin coin", () => {
    const plan = gridOrderPlan({
      topPx: 120,
      bottomPx: 80,
      equity: 10_000,
      params: { ...params, maxOrderVolPct: 1 },
      sizeDecimals: 6,
      // 1% of $50,000 is a $500 cap, under the biggest rung's $800.
      volume24hUsd: 50_000,
    })
    expect(plan.volumeCapped).toBe(true)
    expect(plan.levels[0].dollars).toBeLessThanOrEqual(500)
  })

  it("splits evenly when the switch is off, whatever is remembered", () => {
    const plan = gridOrderPlan({
      topPx: 120,
      bottomPx: 80,
      equity: 10_000,
      params: { ...params, manualSizing: false },
      sizeDecimals: 6,
      volume24hUsd: null,
    })
    expectDollars(plan, [500, 500, 500, 500])
  })

  it("splits evenly when the typed list has drifted from the level count", () => {
    // A guessed share would be a guessed order size, so a list that no longer
    // matches is treated as absent rather than stretched.
    const plan = gridOrderPlan({
      topPx: 120,
      bottomPx: 80,
      equity: 10_000,
      params: { ...params, manualRungPcts: [50, 50] },
      sizeDecimals: 6,
      volume24hUsd: null,
    })
    expectDollars(plan, [500, 500, 500, 500])
    expect(
      gridManualPcts({ ...params, manualRungPcts: [50, 50] }, 4)
    ).toBeNull()
  })

  it("numbers the rows from the market outward", () => {
    // Tyler, 29 Aug 2026: "if long was 1, 2, 3, 4, 5 then short is
    // 5, 4, 3, 2, 1". Rung 1 is the first trade the grid makes: the top of the
    // range on a buying grid, the bottom on a selling one. The ROWS never
    // move — they run down the range like the chart — only the numbers do.
    expect(
      [0, 1, 2, 3].map((row) => gridRowRungNumber(row, 4, "long"))
    ).toEqual([1, 2, 3, 4])
    expect(
      [0, 1, 2, 3].map((row) => gridRowRungNumber(row, 4, "short"))
    ).toEqual([4, 3, 2, 1])

    // Read from a level, which is what a refusal has to do. Level 0 is the
    // bottom of the range.
    expect(gridRungNumber(0, 4, "long")).toBe(4)
    expect(gridRungNumber(0, 4, "short")).toBe(1)

    // Rows and levels are mirror images, with no direction in it.
    expect(gridRowLevelIndex(0, 4)).toBe(3)
    expect(gridLevelPctsFromRows([10, 20, 30, 40])).toEqual([40, 30, 20, 10])
    expect(gridRowPctsFromLevels([40, 30, 20, 10])).toEqual([10, 20, 30, 40])
  })

  it("turning the grid round turns the rows over, and mirrors the chart", () => {
    // What the window does when Long becomes Short, and what a reversal does
    // to a placed grid: each share moves to the other end of the range.
    const buying = [10, 20, 30, 40]
    const selling = gridFlippedPcts(buying)
    expect(selling).toEqual([40, 30, 20, 10])

    const moneyDownTheChart = (direction: "long" | "short", rows: number[]) => {
      const plan = gridOrderPlan({
        topPx: 120,
        bottomPx: 80,
        equity: 10_000,
        params: { ...params, direction, manualRungPcts: rows },
        sizeDecimals: 6,
        volume24hUsd: null,
      })
      return [...plan.levels]
        .sort((a, b) => b.buyPx - a.buyPx)
        .map((one) => Math.round(one.dollars))
    }
    // A buying grid buys more the further price falls.
    expect(moneyDownTheChart("long", buying)).toEqual([200, 400, 600, 800])
    // The selling grid the switch produces sells more the further it climbs.
    expect(moneyDownTheChart("short", selling)).toEqual([800, 600, 400, 200])
  })

  it("repairs a saved split only when its largest rung is on the wrong end", () => {
    expect(gridRungRowsWithLargestFurthest("long", [40, 30, 20, 10])).toEqual([
      10, 20, 30, 40,
    ])
    expect(gridRungRowsWithLargestFurthest("short", [10, 20, 30, 40])).toEqual([
      40, 30, 20, 10,
    ])
    expect(gridRungRowsWithLargestFurthest("short", [40, 30, 20, 10])).toEqual([
      40, 30, 20, 10,
    ])
    expect(gridRungRowsWithLargestFurthest("short", [10, 60, 30])).toEqual([
      10, 60, 30,
    ])
  })

  it("an even split adds to exactly 100, thirds included", () => {
    for (const count of [2, 3, 4, 7, 12, 20]) {
      const pcts = gridEvenRungPcts(count)
      expect(pcts).toHaveLength(count)
      expect(gridRungPctsSum(pcts)).toBeCloseTo(100, 9)
      expect(gridRungPctsFit(pcts)).toBe(true)
    }
  })

  it("takes rounding slack but not a real miss", () => {
    expect(gridRungPctsFit([33.33, 33.33, 33.34])).toBe(true)
    expect(gridRungPctsFit([50, 50])).toBe(true)
    expect(gridRungPctsFit([45, 45])).toBe(false)
    expect(gridRungPctsFit([60, 60])).toBe(false)
  })

  it("is remembered and read back with the rest of the settings", () => {
    const checked = placeGridParamsSchema.safeParse(params)
    expect(checked.success).toBe(true)
    // Settings from before the card existed read back as an even grid.
    const { manualSizing: _on, manualRungPcts: _pcts, ...old } = params
    const older = placeGridParamsSchema.safeParse(old)
    expect(older.success).toBe(true)
    expect(older.success && older.data.manualSizing).toBe(false)
    expect(older.success && older.data.manualRungPcts).toBeNull()
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
          direction: "long",
          clickPx: 95,
          rangePct: 15,
          levels,
          spacing,
        })
        expect(range).not.toBeNull()
        const drawn = gridLevels({
          direction: "long",
          ...range!,
          levels,
          spacing,
        })
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
    expect(
      gridRangeFromClick({
        direction: "long",
        ...ok,
        clickPx: 0,
      })
    ).toBeNull()
    expect(
      gridRangeFromClick({
        direction: "long",
        ...ok,
        rangePct: 0,
      })
    ).toBeNull()
    expect(
      gridRangeFromClick({
        direction: "long",
        ...ok,
        rangePct: 100,
      })
    ).toBeNull()
    expect(
      gridRangeFromClick({
        direction: "long",
        ...ok,
        levels: 1,
      })
    ).toBeNull()
  })
})

describe("gridShiftAway", () => {
  const range = {
    topPx: 120,
    bottomPx: 80,
    levels: 12,
    spacing: "even" as const,
  }

  it("moves whole steps, just far enough to clear the price", () => {
    const moved = gridShiftAway({
      direction: "long",
      ...range,
      mark: 131,
    })
    // A step is (120 − 80) / 12 = 3.333, and 131 is 3.3 steps over the top.
    expect(moved?.steps).toBe(4)
    expect(moved?.topPx).toBeCloseTo(133.333, 3)
    expect(moved?.bottomPx).toBeCloseTo(93.333, 3)
  })

  it("leaves every level below the price, so nothing buys on the way", () => {
    for (const mark of [120.01, 125, 131, 200]) {
      const moved = gridShiftAway({
        direction: "long",
        ...range,
        mark,
      })
      const drawn = gridLevels({
        direction: "long",
        ...range,
        ...moved!,
        levels: range.levels,
      })
      expect(drawn.at(-1)!.buyPx).toBeLessThan(mark)
      expect(moved!.topPx).toBeGreaterThanOrEqual(mark)
    }
  })

  it("moves one step when price reaches the top", () => {
    expect(
      gridShiftAway({
        direction: "long",
        ...range,
        mark: 120,
      })
    ).toEqual({
      topPx: 120 + 40 / 12,
      bottomPx: 80 + 40 / 12,
      steps: 1,
    })
  })

  it("does not move while price is still inside the range", () => {
    expect(
      gridShiftAway({
        direction: "long",
        ...range,
        mark: 100,
      })
    ).toBeNull()
    expect(
      gridShiftAway({
        direction: "long",
        ...range,
        mark: 79,
      })
    ).toBeNull()
  })

  it("keeps the same percent between levels when they are spread that way", () => {
    const percent = {
      ...range,
      spacing: "compounding" as const,
      direction: "long" as const,
    }
    const before = gridStepPct(gridLevels(percent))
    const moved = gridShiftAway({
      ...percent,
      mark: 140,
    })
    const after = gridStepPct(
      gridLevels({
        ...percent,
        ...moved!,
        levels: percent.levels,
      })
    )
    // Which is exactly why a percent-spread grid can follow forever: the fee
    // check reads this number, and moving up never thins it.
    expect(after).toBeCloseTo(before, 9)
  })
})

describe("gridShiftInto", () => {
  const range = {
    topPx: 120,
    bottomPx: 80,
    levels: 4,
    spacing: "even" as const,
  }

  it("moves exactly one level per pass however far price fell", () => {
    expect(
      gridShiftInto({
        direction: "long",
        ...range,
        mark: 80,
      })
    ).toEqual({
      topPx: 110,
      bottomPx: 70,
    })
    expect(
      gridShiftInto({
        direction: "long",
        ...range,
        mark: 79,
      })
    ).toEqual({
      topPx: 110,
      bottomPx: 70,
    })
    expect(
      gridShiftInto({
        direction: "long",
        ...range,
        mark: 5,
      })
    ).toEqual({
      topPx: 110,
      bottomPx: 70,
    })
  })

  it("does not move inside the range or below the market's lowest price", () => {
    expect(
      gridShiftInto({
        direction: "long",
        topPx: 15,
        bottomPx: 5,
        levels: 1,
        spacing: "even",
        mark: 4,
      })
    ).toBeNull()
  })

  it("keeps the same percent spacing", () => {
    const percent = {
      ...range,
      spacing: "compounding" as const,
      direction: "long" as const,
    }
    const before = gridStepPct(gridLevels(percent))
    const moved = gridShiftInto({
      ...percent,
      mark: 79,
    })
    expect(
      gridStepPct(
        gridLevels({
          ...percent,
          ...moved!,
          levels: percent.levels,
        })
      )
    ).toBeCloseTo(before, 9)
  })
})

describe("the exchange's own copy of a grid's stop", () => {
  const plan = {
    direction: "long" as const,
    stopLoss: { mode: "fixed" as const, px: 73.298, base: null, underPct: 5 },
    topPx: 84.5,
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

/**
 * The selling grid: the same grid with every price comparison mirrored.
 *
 * The buying grid's tests above are the proof the direction helpers changed
 * nothing. These are the proof the mirror is a mirror.
 */
describe("a grid that sells first", () => {
  it("puts the deepest sell on the top and the shallowest buy-back on the bottom", () => {
    const levels = gridLevels({
      direction: "short",
      topPx: 120,
      bottomPx: 80,
      levels: 4,
      spacing: "even",
    })
    expect(levels).toHaveLength(4)
    // Sells at 90, 100, 110 and 120, each buying back ten dollars lower.
    expect(levels.map((one) => one.buyPx)).toEqual([90, 100, 110, 120])
    expect(levels.map((one) => one.sellPx)).toEqual([80, 90, 100, 110])
    // The range still means exactly what it says at both ends.
    expect(levels[3].buyPx).toBeCloseTo(120, 9)
    expect(levels[0].sellPx).toBeCloseTo(80, 9)
  })

  it("keeps the same percent between levels when spread that way", () => {
    const levels = gridLevels({
      direction: "short",
      topPx: 160,
      bottomPx: 10,
      levels: 4,
      spacing: "compounding",
    })
    const steps = levels.map((one) => one.buyPx / one.sellPx)
    for (const step of steps) expect(step).toBeCloseTo(steps[0], 9)
    expect(levels[3].buyPx).toBeCloseTo(160, 9)
    expect(levels[0].sellPx).toBeCloseTo(10, 9)
  })

  it("measures the step at the top of the range, where it is thinnest", () => {
    const levels = gridLevels({
      direction: "short",
      topPx: 120,
      bottomPx: 80,
      levels: 4,
      spacing: "even",
    })
    // 10 on a sell of 120, not 10 on a sell of 90.
    expect(gridStepPct(levels)).toBeCloseTo(10 / 120, 9)
  })

  it("hangs the range ABOVE a clicked price, with the click as the lowest sell", () => {
    // The exact mirror of the buying grid, which hangs below the click.
    const range = gridRangeFromClick({
      direction: "short",
      clickPx: 105,
      rangePct: 100 / 7,
      levels: 6,
      spacing: "even",
    })
    expect(range).not.toBeNull()
    expect(range!.topPx).toBeCloseTo(120, 9)
    expect(range!.bottomPx).toBeCloseTo(102, 9)

    const levels = gridLevels({
      direction: "short",
      ...range!,
      levels: 6,
      spacing: "even",
    })
    // The clicked price got its own sell, at the bottom of the stack.
    expect(levels[0].buyPx).toBeCloseTo(105, 9)
  })

  it("slides the range DOWN when price leaves through the bottom", () => {
    const range = {
      topPx: 120,
      bottomPx: 80,
      levels: 4,
      spacing: "even" as const,
      direction: "short" as const,
    }
    // Down is the free move for a selling grid: it has bought everything back.
    const moved = gridShiftAway({ ...range, mark: 65 })
    expect(moved).not.toBeNull()
    expect(moved!.steps).toBe(2)
    expect(moved!.bottomPx).toBeCloseTo(60, 9)
    expect(moved!.topPx).toBeCloseTo(100, 9)
    // And never on a price still inside the range, or above it.
    expect(gridShiftAway({ ...range, mark: 100 })).toBeNull()
    expect(gridShiftAway({ ...range, mark: 121 })).toBeNull()
  })

  it("adds one level UP when price leaves through the top", () => {
    const range = {
      topPx: 120,
      bottomPx: 80,
      levels: 4,
      spacing: "even" as const,
      direction: "short" as const,
    }
    // Up is the dangerous move: it walks a selling grid towards its loss, one
    // level per pass so one fast candle cannot send a pile of sells together.
    const moved = gridShiftInto({ ...range, mark: 130 })
    expect(moved).toEqual({ topPx: 130, bottomPx: 90 })
    expect(gridShiftInto({ ...range, mark: 100 })).toBeNull()
  })

  it("rests its stop above the top and its End Grid below the bottom", () => {
    const range = { topPx: 120, bottomPx: 80 }
    expect(gridStopBeyond("short", range, 5)).toBeCloseTo(126, 9)
    expect(gridEndPx("short", range, 100, 5)).toBeCloseTo(76, 9)
  })

  it("rides a ceiling that has confirmed ABOVE the range, and ignores one inside it", () => {
    const plan = (levelPx: number) => ({
      direction: "short" as const,
      topPx: 120,
      bottomPx: 80,
      stopLoss: {
        mode: "percent" as const,
        underPct: 5,
        px: null,
        base: { underPct: 2, reclaimDays: 1 },
      },
      baseWatch: { levelPx, seenTo: 0 },
    })
    // A ceiling at 130 carries the stop to 2% above it.
    expect(gridStopPx(plan(130))).toBeCloseTo(132.6, 9)
    // A ceiling at 100 is inside the range — a price the grid means to sell
    // at, not one to give up at — so the plain percent above the top stands.
    expect(gridStopPx(plan(100))).toBeCloseTo(126, 9)
  })
})

describe("the price the exchange would close a grid out at", () => {
  const levels = [
    { buyPx: 100, sz: 1 },
    { buyPx: 110, sz: 1 },
  ]

  it("sits ABOVE a short's average sell, because a short has no ceiling", () => {
    const px = gridLiquidationPx({
      direction: "short",
      levels,
      leverage: 5,
      maxLeverage: 50,
    })
    // Average sell 105; the isolated buffer is 1/5 − 1/100 = 0.19.
    expect(px).toBeCloseTo(105 * 1.19, 9)
  })

  it("sits below a long's average buy", () => {
    const px = gridLiquidationPx({
      direction: "long",
      levels,
      leverage: 5,
      maxLeverage: 50,
    })
    expect(px).toBeCloseTo(105 * 0.81, 9)
  })

  it("answers nothing when the exchange never stated a leverage limit", () => {
    // `?? 1` means "the exchange did not say", not "this market caps at 1x" —
    // a refusal built on that guess would be worse than no refusal.
    expect(
      gridLiquidationPx({
        direction: "short",
        levels,
        leverage: 1,
        maxLeverage: 1,
      })
    ).toBeNull()
    expect(
      gridLiquidationPx({
        direction: "short",
        levels: [],
        leverage: 5,
        maxLeverage: 50,
      })
    ).toBeNull()
  })
})

describe("a grid stored under the old field names", () => {
  it("reads back as a working buying grid, with no migration", () => {
    // Exactly what is sitting in the database today: `buyPx`, `sellPx` and
    // `rebuyAbove`, and no `direction` at all.
    const stored = {
      topPx: 120,
      bottomPx: 80,
      takeProfitPx: null,
      spacing: "even",
      sizing: "even",
      potPct: 20,
      maxOrderVolPct: 0,
      startedAt: 1,
      sizeDecimals: 3,
      priceTick: null,
      minOrderValueUsd: 10,
      leverage: 1,
      maxLeverage: 50,
      levels: [
        {
          buyPx: 80,
          sellPx: 90,
          sz: 6.25,
          budget: 500,
          heldSz: 0,
          status: "waiting",
          armed: true,
          dead: false,
          cycles: 0,
          rebuyAbove: 80.8,
        },
        {
          buyPx: 90,
          sellPx: 100,
          sz: 5.55,
          budget: 500,
          heldSz: 5.55,
          status: "holding",
          armed: true,
          dead: false,
          cycles: 2,
        },
      ],
      carriedLevels: [],
      stopLoss: null,
      aimedSlPx: null,
      seenFillsTo: 0,
      cycles: 2,
      closedReason: null,
    }

    const plan = readGridPlan(stored)
    expect(plan).not.toBeNull()
    // A grid with no direction stored is a buying grid, which is what they
    // all were.
    expect(plan!.direction).toBe("long")
    expect(plan!.levels.map((one) => one.buyPx)).toEqual([80, 90])
    expect(plan!.levels.map((one) => one.sellPx)).toEqual([90, 100])
    expect(plan!.levels[0].rebuyAbove).toBeCloseTo(80.8, 9)
    // And it still works: the same budget, at the same price, still holding.
    expect(plan!.levels[1].heldSz).toBeCloseTo(5.55, 9)
    expect(gridLevelSize(plan!.levels[0], 3)).toBeCloseTo(6.25, 2)
  })
})

describe("what a reversal would place", () => {
  const longPlan = (over: Partial<GridPlan> = {}) => ({
    direction: "long" as const,
    topPx: 120,
    bottomPx: 80,
    takeProfitPx: 126,
    stopLoss: {
      mode: "percent" as const,
      underPct: 5,
      px: null,
      base: null,
    },
    baseWatch: null,
    ...over,
  })

  it("turns a buying grid into a selling one over the same lines", () => {
    const reversal = plannedGridReversal(longPlan())
    expect(reversal.ok).toBe(true)
    if (!reversal.ok) return
    expect(reversal.direction).toBe("short")
    // The new stop IS the old End Grid line.
    expect(reversal.stopPx).toBe(126)
    // 126 above a top of 120 is 5% past the new grid's losing edge.
    expect(reversal.stopUnderPct).toBeCloseTo(5, 9)
    // The old stop sat 5% under the bottom; the new End Grid keeps that
    // distance, measured past the fired stop.
    expect(reversal.endPct).toBeCloseTo(5, 9)
  })

  it("turns a selling grid back into a buying one — reversals chain", () => {
    const reversal = plannedGridReversal({
      direction: "short",
      topPx: 120,
      bottomPx: 80,
      takeProfitPx: 72,
      stopLoss: { mode: "fixed", underPct: 5, px: 126, base: null },
      baseWatch: null,
    })
    expect(reversal.ok).toBe(true)
    if (!reversal.ok) return
    expect(reversal.direction).toBe("long")
    expect(reversal.stopPx).toBe(72)
    // 72 under a bottom of 80 is 10% past the new losing edge.
    expect(reversal.stopUnderPct).toBeCloseTo(10, 9)
    // The short's stop sat 5% over the top.
    expect(reversal.endPct).toBeCloseTo(5, 9)
  })

  it("refuses a grid with no End Grid line, in words", () => {
    const reversal = plannedGridReversal(longPlan({ takeProfitPx: null }))
    expect(reversal.ok).toBe(false)
    if (reversal.ok) return
    expect(reversal.reason).toContain("End Grid")
  })

  it("refuses a stop sitting exactly on the range", () => {
    const reversal = plannedGridReversal(
      longPlan({
        stopLoss: { mode: "percent", underPct: 0, px: null, base: null },
      })
    )
    expect(reversal.ok).toBe(false)
    if (reversal.ok) return
    expect(reversal.reason).toContain("no distance")
  })

  it("refuses an End Grid too far past the range to make a stop from", () => {
    // 200 above a top of 120 is 66% out — past the 50% cap a grid's stop
    // schema holds.
    const reversal = plannedGridReversal(longPlan({ takeProfitPx: 200 }))
    expect(reversal.ok).toBe(false)
    if (reversal.ok) return
    expect(reversal.reason).toContain("50%")
  })
})
