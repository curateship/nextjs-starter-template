import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { CandleBar } from "@/lib/protocols/contracts"
import {
  defaultGridParams,
  gridStopPx,
  type GridParams,
  type GridPlan,
} from "@/lib/trade/grid"
import type { TradeWallet } from "@/lib/trade/wallets"
import { type CustomShellDb } from "@/server/db"
import { createTestDatabase, insertUser } from "@/server/test-support"
import {
  cancelGridLevel,
  cancelGridRest,
  moveGridRange,
  placeGridOrder,
  reshapeGrid,
  updateGridStop,
} from "@/server/trade/grid-orders"
import { clearMarketRulesCache } from "@/server/trade/market-rules"
import { loadPaperPortfolio, placePaperOrder } from "@/server/trade/paper"
import { placeDcaLadder } from "@/server/trade/smart-orders"
import {
  tradePaperOrders,
  tradePaperPositions,
  tradeSmartLadders,
  tradeWallets,
} from "@/server/trade/schema"

/**
 * What a grid does as price moves, driven through real settles rather than by
 * calling the engine directly — the same way the ladder's suite works, because
 * the interesting failures are all in how the engine reads what the settle did.
 */

const marks = new Map<string, number>([["BTC", 200]])
let candles: CandleBar[] = []

vi.mock("@/server/protocols/registry", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getProtocol: () => ({
    markets: {
      fetch: async () => ({
        protocol: "hyperliquid",
        protocolLabel: "Hyperliquid",
        network: "mainnet",
        networkLabel: "Mainnet",
        rows: [
          {
            key: "hyperliquid:mainnet:BTC",
            marketId: "BTC",
            symbol: "BTC",
            subExchange: null,
            category: "crypto",
            sizeDecimals: 3,
            maxLeverage: 50,
            isolatedOnly: false,
            iconUrl: null,
            price: marks.get("BTC") ?? 200,
            change24h: null,
            volume24hUsd: 0,
            fundingHourly: null,
            openInterestUsd: null,
          },
        ],
      }),
      prices: async (_network: string, ids: readonly string[]) =>
        new Map(
          ids
            .filter((id) => marks.has(id))
            .map((id) => [id, marks.get(id) as number])
        ),
      candles: async () => candles,
      roundPx: (px: number) => px,
    },
    account: { fetch: async () => null },
  }),
}))

const BTC = "hyperliquid:mainnet:BTC"

let client: PGlite
let database: CustomShellDb
let userId: string
let wallet: TradeWallet

/**
 * A grid from $80 to $120 in four levels — buys at 80, 90, 100 and 110, each
 * selling ten dollars above itself. Price starts at $200, above the whole
 * range, which is where a grid has to be placed.
 */
function params(over: Partial<GridParams> = {}): GridParams {
  return {
    ...defaultGridParams(),
    levels: 4,
    potPct: 20,
    maxOrderVolPct: 0,
    spacing: "even",
    stopLoss: null,
    // Off unless a case asks for it: most of these place a range below the
    // price, where any target would already have been passed.
    takeProfitPct: null,
    ...over,
  }
}

async function place(over: Partial<GridParams> = {}) {
  return await placeGridOrder(userId, wallet, {
    marketKey: BTC,
    topPx: 120,
    bottomPx: 80,
    params: params(over),
  })
}

/** Settles everything — the read every poll makes. */
async function settle() {
  await loadPaperPortfolio(userId, [wallet])
}

/** Moves the price and settles, which is how every case drives the engine. */
async function priceTo(px: number) {
  marks.set("BTC", px)
  await settle()
}

async function orders() {
  return await database
    .select()
    .from(tradePaperOrders)
    .where(eq(tradePaperOrders.userId, userId))
}

async function positions() {
  return await database
    .select()
    .from(tradePaperPositions)
    .where(eq(tradePaperPositions.userId, userId))
}

async function gridRows() {
  return await database
    .select()
    .from(tradeSmartLadders)
    .where(eq(tradeSmartLadders.userId, userId))
}

async function onlyGrid() {
  const rows = await gridRows()
  expect(rows).toHaveLength(1)
  return { ...rows[0], plan: rows[0].plan as GridPlan }
}

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  clearMarketRulesCache()
  marks.set("BTC", 200)
  candles = []

  userId = (await insertUser(database)).id
  await database.insert(tradeWallets).values({
    userId,
    id: "w1",
    label: "Practice",
    kind: "paper",
    status: "active",
    protocol: "hyperliquid",
    network: "mainnet",
    startingBalance: 10_000,
  })
  wallet = {
    id: "w1",
    label: "Practice",
    kind: "paper",
    status: "active",
    protocol: "hyperliquid",
    network: "mainnet",
    startingBalance: 10_000,
    address: null,
    hasKey: false,
    keyValidUntil: null,
  }
})

afterEach(async () => {
  await client.close()
})

describe("placing a grid", () => {
  it("writes one row and rests nothing on the book", async () => {
    const placed = await place()
    expect(placed.levels).toBe(4)

    const grid = await onlyGrid()
    expect(grid.kind).toBe("grid")
    expect(grid.status).toBe("active")
    expect(grid.plan.levels.map((one) => one.buyPx)).toEqual([80, 90, 100, 110])
    expect(grid.plan.levels.map((one) => one.sellPx)).toEqual([90, 100, 110, 120])

    // The whole point: a level is a price the grid WATCHES. Nothing rests, so
    // no cash is tied up, no order slots are used, and the chart has no plain
    // order rows to draw on top of the grid's own lines.
    expect(await orders()).toHaveLength(0)
  })

  it("splits the pot evenly and freezes each level's budget", async () => {
    await place()
    const grid = await onlyGrid()
    // 20% of $10,000 over four levels: $500 each.
    for (const level of grid.plan.levels) {
      expect(level.budget).toBeCloseTo(500, 0)
    }
  })

  it("refuses a range that is upside down", async () => {
    await expect(
      placeGridOrder(userId, wallet, {
        marketKey: BTC,
        topPx: 80,
        bottomPx: 120,
        params: params(),
      })
    ).rejects.toThrow("SMART_GRID_RANGE")
  })

  it("straddles the price: sells above it, buys below it", async () => {
    // The shape a real grid trades in. Price 200 inside 160-240 means the
    // levels at 200 and 220 are what it sells into, and the ones at 160 and
    // 180 are what it waits to buy.
    await placeGridOrder(userId, wallet, {
      marketKey: BTC,
      topPx: 240,
      bottomPx: 160,
      params: params(),
    })
    const grid = await onlyGrid()
    expect(grid.plan.levels.map((one) => one.status)).toEqual([
      "waiting",
      "waiting",
      "holding",
      "holding",
    ])
    // It bought the coins those two sells need, once, at market — and rested
    // nothing for the two levels below, which are simply being watched.
    //
    // Read back from the DATABASE, not from memory: the starting buy used to
    // be applied to the book without marking the market touched, so it was
    // never written, and the next pass closed the grid for holding nothing.
    expect((await positions())[0].szi).toBeGreaterThan(0)
    expect(await orders()).toHaveLength(0)
    // And it is still running a pass later.
    await settle()
    expect((await onlyGrid()).status).toBe("active")
  })

  it("refuses levels too close together to clear the fee", async () => {
    // A 1% range over 20 levels is a step of about 0.05%, and a round trip
    // costs 0.09%. Trading that all day loses money slowly.
    await expect(
      placeGridOrder(userId, wallet, {
        marketKey: BTC,
        topPx: 120,
        bottomPx: 118.8,
        params: params({ levels: 20 }),
      })
    ).rejects.toThrow("SMART_GRID_STEP_TOO_THIN")
  })

  it("only needs the starting buy to be affordable, not the whole plan", async () => {
    // Nothing is reserved, so a grid may plan more than the account holds — a
    // level that cannot be afforded when its turn comes simply waits. Placed
    // below the price there is no starting buy at all, so 100% is fine.
    await place({ potPct: 100 })
    expect((await onlyGrid()).status).toBe("active")
    expect(await orders()).toHaveLength(0)
  })

  it("refuses when the starting buy alone will not fit", async () => {
    await placePaperOrder(userId, wallet, {
      marketKey: BTC,
      side: "buy",
      sz: 48,
      leverage: 1,
      reduceOnly: false,
      tpPx: null,
      slPx: null,
      px: 200,
    })
    await settle()
    // A range straddling the price has to buy its top half right now.
    await expect(
      placeGridOrder(userId, wallet, {
        marketKey: BTC,
        topPx: 240,
        bottomPx: 160,
        params: params({ potPct: 100 }),
      })
    ).rejects.toThrow("SMART_GRID_COST")
  })
})

describe("one smart order per coin per wallet", () => {
  // Both kinds write the one position's stop, so two on the same coin would
  // fight over it. This is the check that makes sharing a table safe.
  it("refuses a grid when a ladder is already working that coin", async () => {
    await placeDcaLadder(userId, wallet, {
      marketKey: BTC,
      clickPx: 190,
      interval: "1m",
      params: {
        rungs: [{ deviation: 5 }],
        cascade: null,
        baseDetection: defaultGridParams().baseDetection,
        maxPositionPct: 10,
        sizeMultiplier: 1,
        leverage: 1,
        compound: true,
        maxOrderVolPct: 0,
        twoGreen: false,
        rungEntry: "limit",
        anchor: "click",
        takeProfit: null,
        stopLoss: null,
      },
    })
    await expect(place()).rejects.toThrow("SMART_LADDER_EXISTS")
  })

  it("refuses a ladder when a grid is already working that coin", async () => {
    await place()
    await expect(
      placeDcaLadder(userId, wallet, {
        marketKey: BTC,
        clickPx: 190,
        interval: "1m",
        params: {
          rungs: [{ deviation: 5 }],
          cascade: null,
          baseDetection: defaultGridParams().baseDetection,
          maxPositionPct: 10,
          sizeMultiplier: 1,
          leverage: 1,
          compound: true,
          maxOrderVolPct: 0,
          twoGreen: false,
          rungEntry: "limit",
          anchor: "click",
          takeProfit: null,
          stopLoss: null,
        },
      })
    ).rejects.toThrow("SMART_LADDER_EXISTS")
  })
})

describe("the recycle", () => {
  it("buys, rests a sell one step up, and puts the buy back when it fills", async () => {
    await place()

    // Price reaches the level at 100, which sells at 110 — a round trip inside
    // the range, which is the whole point of a grid.
    await priceTo(99)
    let grid = await onlyGrid()
    expect(grid.plan.levels[2].status).toBe("holding")
    expect(grid.plan.levels[2].heldSz).toBeGreaterThan(0)
    // It bought when the level was reached. Nothing was resting before that.
    expect((await positions())[0].szi).toBeGreaterThan(0)
    expect(await orders()).toHaveLength(0)

    // And back up to that level's sell at 110.
    await priceTo(110)
    grid = await onlyGrid()
    // THE RECYCLE: back to watching, holding nothing, ready to buy the same
    // price again the moment it is reached.
    expect(grid.plan.levels[2].status).toBe("waiting")
    expect(grid.plan.levels[2].heldSz).toBe(0)
    expect(grid.plan.levels[2].buyPx).toBe(100)
    expect(grid.plan.levels[2].cycles).toBe(1)
    expect(grid.plan.cycles).toBe(1)
    expect(grid.status).toBe("active")
    expect(grid.plan.levels[3].status).toBe("holding")
  })

  it("spends the same dollars on the second cycle as on the first", async () => {
    await place()
    const before = (await onlyGrid()).plan.levels[3].budget

    await priceTo(109)
    await priceTo(120)
    await priceTo(109)

    const grid = await onlyGrid()
    expect(grid.plan.levels[3].budget).toBeCloseTo(before, 9)
    // The size it bought the second time is the budget at the same price, so
    // it is the same size — no leftover from a cheaper round carried forward.
    expect(grid.plan.levels[3].sz).toBeCloseTo(before / 110, 3)
  })

  it("arms every level a fast fall passed, not just one", async () => {
    await place()
    // Straight through all four in one move.
    await priceTo(79)
    const grid = await onlyGrid()
    for (const level of grid.plan.levels) {
      expect(level.status).toBe("holding")
    }
  })
})

describe("running out of the range", () => {
  it("keeps running above the top when there is no take profit", async () => {
    // Out of the top is not the end of a grid. It has simply sold everything
    // it had up there and is waiting for price to come back into its range.
    await place()
    await priceTo(109)
    await priceTo(130)
    const grid = await onlyGrid()
    expect(grid.status).toBe("active")
  })

  it("sells everything and finishes at the take profit", async () => {
    // A range straddling the price, so there is something held from the start.
    await placeGridOrder(userId, wallet, {
      marketKey: BTC,
      topPx: 240,
      bottomPx: 160,
      params: params({ takeProfitPct: 10 }),
    })
    // 10% above a top of 240 is 264.
    expect((await onlyGrid()).plan.takeProfitPx).toBeCloseTo(264, 9)
    expect((await positions())[0].szi).toBeGreaterThan(0)

    await priceTo(266)
    const grid = await onlyGrid()
    expect(grid.status).toBe("done")
    expect(grid.plan.closedReason).toBe("takeProfit")
    expect(await positions()).toHaveLength(0)
    expect(await orders()).toHaveLength(0)
  })

  it("stops buying but stays open below the bottom, holding what it has", async () => {
    await place()
    await priceTo(75)

    const grid = await onlyGrid()
    expect(grid.status).toBe("active")
    // Everything bought on the way down; nothing new arms below the bottom.
    expect(
      grid.plan.levels.every((one) => one.status === "holding")
    ).toBe(true)
    expect((await positions())[0].szi).toBeGreaterThan(0)
  })

  it("is still priced when it holds nothing and rests nothing", async () => {
    // The market list used to come from positions and orders alone, so a smart
    // order with neither dropped off it — and one that is not priced can never
    // see price come back. Now that levels are triggers this is EVERY grid
    // before its first buy, not a corner case.
    await place()
    expect(await orders()).toHaveLength(0)
    expect(await positions()).toHaveLength(0)

    const { exposedMarketKeys } = await import("@/server/trade/paper")
    expect(await exposedMarketKeys(userId, [wallet.id])).toContain(BTC)
  })
})

describe("the stop", () => {
  it("closes everything and ends the grid when price cuts through it", async () => {
    await place({ stopLoss: { underPct: 5, base: null } })
    await priceTo(109)
    // The stop rests at 5% under the bottom of the range: $76.
    let grid = await onlyGrid()
    expect(grid.plan.aimedSlPx).toBeCloseTo(76, 9)
    expect((await positions())[0].slPx).toBeCloseTo(76, 9)

    await priceTo(70)
    grid = await onlyGrid()
    expect(grid.status).toBe("done")
    expect(await positions()).toHaveLength(0)
  })

  it("fades a level under the stop and brings it back when the stop moves down", async () => {
    // A stop ON the bottom kills the level sitting there: price cannot reach
    // it without the stop firing first.
    await place({ stopLoss: { underPct: 0, base: null } })
    await priceTo(109)
    let grid = await onlyGrid()
    expect(grid.plan.levels[0].dead).toBe(true)

    await updateGridStop(userId, wallet, {
      gridId: grid.id,
      stopLoss: { underPct: 20, base: null },
    })
    grid = await onlyGrid()
    expect(grid.plan.levels[0].dead).toBe(false)
  })

  it("stops following a stop a hand moved", async () => {
    await place({ stopLoss: { underPct: 5, base: null } })
    await priceTo(109)

    await database
      .update(tradePaperPositions)
      .set({ slPx: 60 })
      .where(eq(tradePaperPositions.userId, userId))
    await settle()

    const grid = await onlyGrid()
    expect(grid.plan.stopLoss?.mode).toBe("fixed")
    expect(grid.plan.stopLoss?.px).toBeCloseTo(60, 9)
    expect((await positions())[0].slPx).toBeCloseTo(60, 9)
  })

  it("keeps aiming its stop after the position closed and reopened", async () => {
    // For a ladder this is an edge case; for a grid, going flat and back is
    // the ordinary weekly path. Left unhandled, the reopened position looks
    // exactly like a hand removing the stop and the grid never aims again.
    await place({ stopLoss: { underPct: 5, base: null } })
    await priceTo(109)
    // Sold out at that level's own price and gone flat, still inside the range.
    await priceTo(120)
    expect(await positions()).toHaveLength(0)

    // Bought again on the way back down.
    await priceTo(109)
    const grid = await onlyGrid()
    expect(grid.plan.stopLoss?.mode).toBe("percent")
    expect((await positions())[0].slPx).toBeCloseTo(76, 9)
  })
})

describe("calling levels off", () => {
  it("cancels one level for good — it does not come back", async () => {
    await place()
    const grid = await onlyGrid()
    await cancelGridLevel(userId, wallet, { gridId: grid.id, levelIndex: 3 })

    let after = await onlyGrid()
    expect(after.plan.levels[3].status).toBe("cancelled")

    // Price reaching it changes nothing — cancelled is the one exit from the
    // recycle.
    await priceTo(109)
    after = await onlyGrid()
    expect(after.plan.levels[3].status).toBe("cancelled")
  })

  it("cancels every waiting level at once and keeps what is held", async () => {
    await place()
    await priceTo(109)
    const { cancelled } = await cancelGridRest(userId, wallet, {
      gridId: (await onlyGrid()).id,
    })
    expect(cancelled).toBe(3)

    const grid = await onlyGrid()
    expect(grid.status).toBe("active")
    expect(grid.plan.levels[3].status).toBe("holding")
    expect((await positions())[0].szi).toBeGreaterThan(0)
  })
})

describe("moving the range", () => {
  it("re-prices every level", async () => {
    await place()

    await moveGridRange(userId, wallet, {
      gridId: (await onlyGrid()).id,
      topPx: 160,
      bottomPx: 120,
    })

    const grid = await onlyGrid()
    expect(grid.plan.topPx).toBe(160)
    expect(grid.plan.bottomPx).toBe(120)
    expect(grid.plan.levels.map((one) => one.buyPx)).toEqual([120, 130, 140, 150])
    // Nothing to swap on the book: there was never anything resting.
    expect(await orders()).toHaveLength(0)
  })

  it("keeps the stop it was given", async () => {
    await place({ stopLoss: { underPct: 5, base: null } })
    await moveGridRange(userId, wallet, {
      gridId: (await onlyGrid()).id,
      topPx: 160,
      bottomPx: 120,
    })
    const grid = await onlyGrid()
    expect(grid.plan.stopLoss?.underPct).toBe(5)
    // And it follows the new bottom, because that is what it hangs off.
    expect(gridStopPx(grid.plan)).toBeCloseTo(114, 9)
  })

  it("can be moved again and again, including after it has bought", async () => {
    // The report this is here for: dragging the top up once worked, and then
    // the range could never be moved again — because dragging up is what
    // creates a holding level, and the rule locked on exactly that.
    await place()
    const id = (await onlyGrid()).id

    await moveGridRange(userId, wallet, { gridId: id, topPx: 240, bottomPx: 160 })
    expect((await onlyGrid()).plan.levels.some((one) => one.status === "holding")).toBe(true)

    await moveGridRange(userId, wallet, { gridId: id, topPx: 260, bottomPx: 170 })
    let grid = await onlyGrid()
    expect(grid.status).toBe("active")
    expect(grid.plan.topPx).toBe(260)

    // And a third time, back down below the price, which sells what the levels
    // above no longer need.
    await moveGridRange(userId, wallet, { gridId: id, topPx: 150, bottomPx: 100 })
    grid = await onlyGrid()
    expect(grid.status).toBe("active")
    expect(grid.plan.topPx).toBe(150)
    expect(grid.plan.levels.every((one) => one.status === "waiting")).toBe(true)
    expect(await positions()).toHaveLength(0)
    await settle()
    expect((await onlyGrid()).status).toBe("active")
  })

  it("buys what a range dragged up over the price now needs", async () => {
    // Dragging the top up puts levels above the price, and a level above the
    // price is one the grid sells at — so it has to hold the coins for them.
    // Without that the plan said "holding" with nothing behind it and the very
    // next pass closed the grid, so the whole thing vanished off the chart.
    await place()
    expect(await positions()).toHaveLength(0)

    await moveGridRange(userId, wallet, {
      gridId: (await onlyGrid()).id,
      // Price is 200. A top of 240 puts two levels above it.
      topPx: 240,
      bottomPx: 160,
    })

    let grid = await onlyGrid()
    expect(grid.status).toBe("active")
    expect(grid.plan.levels.map((one) => one.status)).toEqual([
      "waiting",
      "waiting",
      "holding",
      "holding",
    ])
    expect((await positions())[0].szi).toBeGreaterThan(0)

    // And it is still there a pass later, which is the bit that was broken.
    await settle()
    grid = await onlyGrid()
    expect(grid.status).toBe("active")
    expect(await orders()).toHaveLength(0)
  })

  it("refuses an upside-down move, and changes nothing", async () => {
    await place()
    const before = (await onlyGrid()).plan.levels.map((one) => one.buyPx)
    await expect(
      moveGridRange(userId, wallet, {
        gridId: (await onlyGrid()).id,
        topPx: 90,
        bottomPx: 150,
      })
    ).rejects.toThrow("SMART_GRID_RANGE")
    expect((await onlyGrid()).plan.levels.map((one) => one.buyPx)).toEqual(before)
  })
})

describe("re-slicing a running grid", () => {
  it("changes how many levels the range has", async () => {
    await place()
    const id = (await onlyGrid()).id
    expect((await onlyGrid()).plan.levels).toHaveLength(4)

    await reshapeGrid(userId, wallet, { gridId: id, levels: 8 })

    const grid = await onlyGrid()
    expect(grid.status).toBe("active")
    expect(grid.plan.levels).toHaveLength(8)
    // Same range, cut finer: the step halves and so does what a round trip
    // earns.
    expect(grid.plan.topPx).toBe(120)
    expect(grid.plan.bottomPx).toBe(80)
    expect(grid.plan.levels[1].buyPx - grid.plan.levels[0].buyPx).toBeCloseTo(5, 9)
  })

  it("changes what each level spends, and every level with it", async () => {
    await place()
    const id = (await onlyGrid()).id
    const before = (await onlyGrid()).plan.levels[0].budget

    await reshapeGrid(userId, wallet, { gridId: id, potPct: 10 })

    const grid = await onlyGrid()
    // Half the share of the account, so half the money in each slice.
    for (const level of grid.plan.levels) {
      expect(level.budget).toBeCloseTo(before / 2, 0)
    }
  })

  it("settles what is held when a re-slice changes the sizes", async () => {
    // Straddling, so it is holding something that the new sizes change.
    await placeGridOrder(userId, wallet, {
      marketKey: BTC,
      topPx: 240,
      bottomPx: 160,
      params: params(),
    })
    const id = (await onlyGrid()).id
    const heldBefore = (await positions())[0].szi

    await reshapeGrid(userId, wallet, { gridId: id, potPct: 10 })

    // Half the money means half the coins standing behind the sells above.
    const heldAfter = (await positions())[0].szi
    expect(heldAfter).toBeLessThan(heldBefore)
    expect(heldAfter).toBeCloseTo(heldBefore / 2, 1)
    // And it is still running a pass later, holding what it says it holds.
    await settle()
    expect((await onlyGrid()).status).toBe("active")
  })

  it("refuses a re-slice that makes the step too thin to clear the fee", async () => {
    // A dollar-wide range is fine cut in two — 50 cents a round trip — and
    // hopeless cut into twenty, where each step is five cents and two trading
    // fees eat it. The re-slice goes through the same refusal a fresh grid
    // would, which is the point of drawing it with the same planner.
    await placeGridOrder(userId, wallet, {
      marketKey: BTC,
      topPx: 101,
      bottomPx: 100,
      params: params({ levels: 2 }),
    })
    const id = (await onlyGrid()).id
    await expect(
      reshapeGrid(userId, wallet, { gridId: id, levels: 20 })
    ).rejects.toThrow("SMART_GRID_STEP_TOO_THIN")
    // And it is left exactly as it was.
    expect((await onlyGrid()).plan.levels).toHaveLength(2)
  })
})

describe("a market the exchange will not price", () => {
  it("still writes the stop onto what is held", async () => {
    // A pass with no price can fire no trigger — nothing has been reached. It
    // must still aim the stop: the position is real whether or not there is a
    // quote for it, and returning early here left it unprotected.
    await place({ stopLoss: { underPct: 5, base: null } })
    await priceTo(109)
    expect((await positions())[0].slPx).toBeCloseTo(76, 9)

    // The stop taken off by hand, then a pass with no price at all.
    await database
      .update(tradePaperPositions)
      .set({ slPx: null })
      .where(eq(tradePaperPositions.userId, userId))
    await database
      .update(tradeSmartLadders)
      .set({ plan: { ...(await onlyGrid()).plan, aimedSlPx: null } })
      .where(eq(tradeSmartLadders.userId, userId))
    marks.delete("BTC")
    await settle()

    // Aimed again, without a price ever being read.
    expect((await positions())[0].slPx).toBeCloseTo(76, 9)
    expect((await onlyGrid()).status).toBe("active")
  })
})

describe("the background worker", () => {
  it("picks up a wallet whose only smart order is a grid", async () => {
    // The worker asks which wallets have work by status alone and never reads a
    // plan, which is what lets a new kind of smart order be driven by it with
    // no change to the job. This is the test that says so.
    await place()
    const { walletsWithWork } = await import("@/server/trade/ladder-worker")
    const found = await walletsWithWork()
    expect(found.map((one) => one.wallet.id)).toContain("w1")
  })
})

describe("a hand in the middle of it", () => {
  it("ends the grid if the position is turned into a short by hand", async () => {
    await place()
    await priceTo(109)
    const held = (await positions())[0].szi
    await placePaperOrder(userId, wallet, {
      marketKey: BTC,
      side: "sell",
      sz: held * 3,
      leverage: 1,
      reduceOnly: false,
      tpPx: null,
      slPx: null,
      px: 109,
    })
    await settle()

    expect((await onlyGrid()).status).toBe("done")
  })
})
