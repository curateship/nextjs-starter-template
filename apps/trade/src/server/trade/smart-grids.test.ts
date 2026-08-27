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
  setGridFollow,
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
    expect(grid.plan.levels.map((one) => one.sellPx)).toEqual([
      90, 100, 110, 120,
    ])

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

  it("buys nothing when the range straddles the price", async () => {
    // THE RULE: a rung buys at its own price, or it does not buy.
    //
    // Price 200 inside 160-240 puts the levels at 200 and 220 above the market.
    // Those used to be bought immediately, all in one order at 200 — so the
    // level at 220 sold against coins it had never paid 220 for, and the
    // account was at its most long the second the grid was placed. One big
    // lump is not a grid.
    await placeGridOrder(userId, wallet, {
      marketKey: BTC,
      topPx: 240,
      bottomPx: 160,
      params: params(),
    })
    const grid = await onlyGrid()
    expect(grid.plan.levels.every((one) => one.status === "waiting")).toBe(true)
    expect(await positions()).toHaveLength(0)
    expect(await orders()).toHaveLength(0)

    // The two under the price may buy the moment price reaches them. The two
    // above wait for price to climb past them and come back down.
    expect(grid.plan.levels.map((one) => one.armed)).toEqual([
      true,
      true,
      false,
      false,
    ])
    await settle()
    expect((await onlyGrid()).status).toBe("active")
  })

  it("hands the grid back, so the chart can draw it at once", async () => {
    // The window clears its preview lines as it closes, and the next read waits
    // on an exchange round trip. Without the grid travelling back with the
    // answer, nothing is drawn in between and it blinks off the chart.
    const placed = await placeGridOrder(userId, wallet, {
      marketKey: BTC,
      topPx: 240,
      bottomPx: 160,
      params: params(),
    })
    const saved = await onlyGrid()
    expect(placed.grid.id).toBe(saved.id)
    expect(placed.grid.status).toBe("active")
    expect(placed.grid.kind).toBe("grid")
    expect(placed.grid.marketKey).toBe(BTC)
    expect(placed.grid.plan.levels).toHaveLength(saved.plan.levels.length)
  })

  it("buys a level above the price only after price has been above it", async () => {
    await placeGridOrder(userId, wallet, {
      marketKey: BTC,
      topPx: 240,
      bottomPx: 160,
      params: params(),
    })
    // Price sits between 200 and 220 for a while. Nothing has been above 220,
    // so that level still cannot buy, however long it waits there.
    await priceTo(205)
    expect((await onlyGrid()).plan.levels[3].status).toBe("waiting")
    expect(await positions()).toHaveLength(0)

    // Price climbs past 220, which arms it, then comes back down to it.
    await priceTo(225)
    expect((await onlyGrid()).plan.levels[3].armed).toBe(true)
    await priceTo(219)

    const grid = await onlyGrid()
    expect(grid.plan.levels[3].status).toBe("holding")
    // At ITS OWN price, which is the whole point.
    expect(grid.plan.levels[3].buyPx).toBeCloseTo(220, 9)
    expect((await positions())[0].szi).toBeGreaterThan(0)
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

  it("costs nothing to place, so free cash cannot refuse it", async () => {
    // Almost all the cash is behind a hand-placed position. A grid straddling
    // the price used to be refused here, because it had to buy its top half on
    // the spot. It buys nothing now, so there is nothing to refuse.
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
    await placeGridOrder(userId, wallet, {
      marketKey: BTC,
      topPx: 240,
      bottomPx: 160,
      params: params({ potPct: 100 }),
    })
    expect((await onlyGrid()).status).toBe("active")
  })
})

describe("one smart order per coin per wallet", () => {
  // Both kinds write the one position's stop, so two on the same coin would
  // fight over it. The one exception — a grid above a ladder — lives on live
  // wallets only: the paper book holds one stop per position and cannot
  // simulate the handoff, so a practice wallet gets the pairing's own
  // refusal instead of the blanket one.
  it("refuses a grid when a ladder is already working that coin", async () => {
    await placeDcaLadder(userId, wallet, {
      marketKey: BTC,
      clickPx: 190,
      interval: "1m",
      params: {
        rungs: [{ deviation: 5 }],
        cascade: null,
        entryLimit: null,
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
    await expect(place()).rejects.toThrow("SMART_PAIR_LIVE_ONLY")
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
          entryLimit: null,
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
    ).rejects.toThrow("SMART_PAIR_LIVE_ONLY")
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
    await placeGridOrder(userId, wallet, {
      marketKey: BTC,
      topPx: 240,
      bottomPx: 160,
      params: params({ takeProfitPct: 10 }),
    })
    // 10% above a top of 240 is 264.
    expect((await onlyGrid()).plan.takeProfitPx).toBeCloseTo(264, 9)
    // Nothing is held on the way in, so trade into a position the honest way:
    // price falls to a level under it and that level buys at its own price.
    expect(await positions()).toHaveLength(0)
    await priceTo(180)
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
    expect(grid.plan.levels.every((one) => one.status === "holding")).toBe(true)
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
    expect(grid.plan.levels.map((one) => one.buyPx)).toEqual([
      120, 130, 140, 150,
    ])
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

  it("can be moved again and again while it holds nothing", async () => {
    await place()
    const id = (await onlyGrid()).id

    await moveGridRange(userId, wallet, {
      gridId: id,
      topPx: 240,
      bottomPx: 160,
    })
    expect((await onlyGrid()).plan.topPx).toBe(240)

    await moveGridRange(userId, wallet, {
      gridId: id,
      topPx: 260,
      bottomPx: 170,
    })
    expect((await onlyGrid()).plan.topPx).toBe(260)

    await moveGridRange(userId, wallet, {
      gridId: id,
      topPx: 150,
      bottomPx: 100,
    })
    const grid = await onlyGrid()
    expect(grid.status).toBe("active")
    expect(grid.plan.topPx).toBe(150)
    // Not one order in all of that. Moving a range that owns nothing is free.
    expect(await positions()).toHaveLength(0)
    expect(await orders()).toHaveLength(0)
  })

  it("buys nothing when a range is dragged up over the price", async () => {
    // Dragging the top up puts levels above the price. Those used to be bought
    // on the spot, at one price belonging to none of them.
    await place()
    await moveGridRange(userId, wallet, {
      gridId: (await onlyGrid()).id,
      // Price is 200. A top of 240 puts two levels above it.
      topPx: 240,
      bottomPx: 160,
    })

    const grid = await onlyGrid()
    expect(grid.status).toBe("active")
    expect(grid.plan.levels.every((one) => one.status === "waiting")).toBe(true)
    expect(grid.plan.levels.map((one) => one.armed)).toEqual([
      true,
      true,
      false,
      false,
    ])
    expect(await positions()).toHaveLength(0)
    await settle()
    expect((await onlyGrid()).status).toBe("active")
  })

  it("refuses to move a range once a level is holding", async () => {
    // That level bought at its own price and sells one step above it. Sliding
    // the range under it would leave it selling coins it never paid that price
    // for, which is the lump this order type exists to avoid.
    await place()
    await priceTo(109)
    expect(
      (await onlyGrid()).plan.levels.some((one) => one.status === "holding")
    ).toBe(true)

    await expect(
      moveGridRange(userId, wallet, {
        gridId: (await onlyGrid()).id,
        topPx: 240,
        bottomPx: 160,
      })
    ).rejects.toThrow("SMART_GRID_STARTED")
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
    expect((await onlyGrid()).plan.levels.map((one) => one.buyPx)).toEqual(
      before
    )
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
    expect(grid.plan.levels[1].buyPx - grid.plan.levels[0].buyPx).toBeCloseTo(
      5,
      9
    )
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

  it("re-slices without buying or selling anything", async () => {
    // There is nothing to settle: a grid that holds nothing owns nothing to
    // adjust, and one that holds something refuses the re-slice outright.
    await placeGridOrder(userId, wallet, {
      marketKey: BTC,
      topPx: 240,
      bottomPx: 160,
      params: params(),
    })
    const id = (await onlyGrid()).id

    await reshapeGrid(userId, wallet, { gridId: id, potPct: 10 })

    const grid = await onlyGrid()
    expect(grid.plan.potPct).toBe(10)
    expect(await positions()).toHaveLength(0)
    expect(await orders()).toHaveLength(0)
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

describe("following price up", () => {
  it("moves every rung up when the highest rung sells at the top", async () => {
    await priceTo(100)
    await place({ follow: true })
    await priceTo(111)
    await priceTo(109)
    expect((await onlyGrid()).plan.levels.at(-1)?.status).toBe("holding")

    await priceTo(120)

    const grid = await onlyGrid()
    expect(grid.plan.shifts).toBe(1)
    expect(grid.plan.topPx).toBeCloseTo(130, 9)
    expect(grid.plan.bottomPx).toBeCloseTo(90, 9)
    expect(await positions()).toHaveLength(0)

    // Another engine pass at the same price must not buy the moved top rung.
    // Price has to reach the next rung above it, then return.
    await settle()
    expect(await positions()).toHaveLength(0)
    await priceTo(130)
    await priceTo(129)
    await priceTo(120)
    expect(
      (await onlyGrid()).plan.levels.find((level) => level.buyPx === 120)
        ?.status
    ).toBe("holding")
  })

  it("waits for a full rung above the sold price before buying there again", async () => {
    await priceTo(100)
    await place({ follow: true })
    await priceTo(111)
    await priceTo(109)

    // Price clears the $120 sale and moves the range up. That same $121 look
    // cannot also ready the new $120 buy created by the move.
    await priceTo(121)
    let grid = await onlyGrid()
    expect(grid.plan.shifts).toBe(1)
    expect(grid.plan.levels.at(-1)).toMatchObject({
      buyPx: 120,
      sellPx: 130,
      status: "waiting",
      armed: false,
      rebuyAbove: 130,
    })

    // CHIP sold near $0.04331 and bought near $0.04320 after 74 seconds. Any
    // amount of time and any tiny wobble below the next rung still spends
    // nothing.
    await priceTo(120)
    await priceTo(129)
    await priceTo(120)
    expect(await positions()).toHaveLength(0)

    // Reaching the next rung makes the sold line ready. Only a later return to
    // the sold price may buy it again.
    await priceTo(130)
    await priceTo(129)
    await priceTo(120)
    grid = await onlyGrid()
    expect(grid.plan.levels.find((level) => level.buyPx === 120)?.status).toBe(
      "holding"
    )
  })

  it("slides the range up a whole step once price clears the top", async () => {
    // Placed straddling $100, so two levels hold from the start. At $130 both
    // of those sell, the grid is empty, and only then does it move.
    await priceTo(100)
    await place({ follow: true })
    await priceTo(130)

    const grid = await onlyGrid()
    expect(grid.plan.shifts).toBe(1)
    // A step is $10, and $130 is one step over a top of $120.
    expect(grid.plan.topPx).toBeCloseTo(130, 9)
    expect(grid.plan.bottomPx).toBeCloseTo(90, 9)
    // The whole point: moving it costs nothing.
    expect(await orders()).toHaveLength(0)
    expect(await positions()).toHaveLength(0)
    expect(grid.plan.levels.every((one) => one.status === "waiting")).toBe(true)
  })

  it("lets another upward move satisfy the sold price's full-rung requirement", async () => {
    await priceTo(100)
    await place({ follow: true })
    await priceTo(111)
    await priceTo(109)
    await priceTo(121)

    // The $120 sold line needs $130 before it may buy again. That rise also
    // moves the range, but it still counts as the full move the line needed.
    await priceTo(130)
    let grid = await onlyGrid()
    expect(grid.plan.shifts).toBe(2)
    const soldLine = grid.plan.levels.find((level) => level.buyPx === 120)
    expect(soldLine?.armed).toBe(true)
    expect(soldLine?.rebuyAbove).toBeUndefined()
    await priceTo(129)
    expect(await positions()).toHaveLength(0)

    await priceTo(120)
    grid = await onlyGrid()
    expect(grid.plan.levels.find((level) => level.buyPx === 120)?.status).toBe(
      "holding"
    )
  })

  it("leaves every level under the price, so the move buys nothing", async () => {
    await priceTo(100)
    await place({ follow: true })
    await priceTo(130)

    const grid = await onlyGrid()
    for (const level of grid.plan.levels) {
      expect(level.buyPx).toBeLessThan(130)
    }
  })

  it("buys again out of the moved range when price comes back down", async () => {
    await priceTo(100)
    await place({ follow: true })
    await priceTo(130)
    // The moved range is $90 to $130, so its top buy is $120.
    // The move itself does not ready that new buy. Price must reach its $130
    // sell first, then return.
    await priceTo(130)
    await priceTo(129)
    await priceTo(120)

    const grid = await onlyGrid()
    expect(grid.plan.levels.find((level) => level.buyPx === 120)?.status).toBe(
      "holding"
    )
    expect((await positions())[0].szi).toBeGreaterThan(0)
  })

  it("carries the stop up with the bottom of the range", async () => {
    await priceTo(100)
    await place({ follow: true, stopLoss: { underPct: 5, base: null } })
    await priceTo(130)

    const grid = await onlyGrid()
    expect(grid.plan.bottomPx).toBeCloseTo(90, 9)
    // Five percent under the new bottom, not the old one. A grid that keeps
    // climbing keeps what it has made.
    expect(gridStopPx(grid.plan)).toBeCloseTo(85.5, 9)
  })

  it("leaves a grid placed below the price alone until price reaches it", async () => {
    // Placed with the price far above the whole range — the click-anchored
    // shape: a grid hung under a level, waiting for a fall. The remembered
    // follow setting rode along, and follow used to fire on the first pass
    // and drag the range straight up to the market, which threw away the
    // placement. The range has never been in play, so it must not move.
    await priceTo(200)
    await place({ follow: true })
    await settle()

    const parked = await onlyGrid()
    expect(parked.plan.shifts).toBe(0)
    expect(parked.plan.topPx).toBeCloseTo(120, 9)

    // Price falls into the range: from here it is a working grid, and follow
    // behaves exactly as it does for one placed straddling the price.
    await priceTo(119)
    expect((await onlyGrid()).plan.entered).toBe(true)
  })

  it("stays where it is when following is off", async () => {
    await priceTo(100)
    await place()
    await priceTo(130)

    const grid = await onlyGrid()
    expect(grid.plan.shifts).toBe(0)
    expect(grid.plan.topPx).toBeCloseTo(120, 9)
  })

  it("will not move while anything is held, even by hand", async () => {
    // The grid's own levels hold nothing here — price has been above the top
    // since it was placed. The position came from a hand trade, and moving the
    // range under it would re-price levels against coins the grid never chose.
    await place()
    await placePaperOrder(userId, wallet, {
      marketKey: BTC,
      side: "buy",
      sz: 0.1,
      leverage: 1,
      reduceOnly: false,
      tpPx: null,
      slPx: null,
      px: 200,
    })
    await settle()
    await setGridFollow(userId, wallet, {
      gridId: (await onlyGrid()).id,
      follow: true,
    })
    await priceTo(130)

    const grid = await onlyGrid()
    expect(grid.plan.shifts).toBe(0)
    expect(grid.plan.topPx).toBeCloseTo(120, 9)
  })

  it("stops following once the step would no longer clear the fee", async () => {
    // Levels the same dollars apart earn a smaller PERCENTAGE the higher the
    // range climbs: $10 is 9% of $110 and a rounding error at $8,000. Rather
    // than follow price into round trips that lose money on fees, it parks.
    await place()
    await setGridFollow(userId, wallet, {
      gridId: (await onlyGrid()).id,
      follow: true,
    })
    // Switching it on catches the range up to the price straight away, which
    // is the whole point of following. Take that as the starting point.
    const caughtUp = await onlyGrid()
    expect(caughtUp.plan.shifts).toBe(1)
    expect(caughtUp.plan.topPx).toBeCloseTo(200, 9)

    await priceTo(8000)

    const grid = await onlyGrid()
    // Not one step further. $10 is 5% of $190 and a rounding error at $8,000.
    expect(grid.plan.shifts).toBe(1)
    expect(grid.plan.topPx).toBeCloseTo(200, 9)
    expect(grid.status).toBe("active")
  })

  it("catches the range up the moment following is switched on", async () => {
    // Price has been above the top since it was placed. Turning following on
    // should not wait for the next tick to notice.
    await place()
    expect((await onlyGrid()).plan.topPx).toBeCloseTo(120, 9)

    await setGridFollow(userId, wallet, {
      gridId: (await onlyGrid()).id,
      follow: true,
    })

    const grid = await onlyGrid()
    expect(grid.plan.shifts).toBe(1)
    expect(grid.plan.topPx).toBeCloseTo(200, 9)
    // Free, as always: the range moved and nothing was traded.
    expect(await positions()).toHaveLength(0)
    expect(await orders()).toHaveLength(0)
  })

  it("clears the finish line when following is switched on", async () => {
    await priceTo(100)
    await place({ takeProfitPct: 10 })
    expect((await onlyGrid()).plan.takeProfitPx).toBeCloseTo(132, 9)

    await setGridFollow(userId, wallet, {
      gridId: (await onlyGrid()).id,
      follow: true,
    })
    // A range that slides up ahead of price can never reach a line above it,
    // so the line goes rather than sitting there looking like an exit.
    const grid = await onlyGrid()
    expect(grid.plan.takeProfitPx).toBeNull()
    expect(grid.plan.follow).toBe(true)
  })
})

describe("following price down", () => {
  it("moves every rung down when the lowest rung buys at the bottom", async () => {
    await priceTo(100)
    await place({ followDown: true })
    await priceTo(121)

    await priceTo(80)

    const grid = await onlyGrid()
    expect(grid.plan.downShifts).toBe(1)
    expect(grid.plan.topPx).toBeCloseTo(110, 9)
    expect(grid.plan.bottomPx).toBeCloseTo(70, 9)
    expect(grid.plan.levels.map((level) => level.buyPx)).toEqual([
      70, 80, 90, 100,
    ])
  })

  it("moves one level lower and keeps old holdings at their original sells", async () => {
    await priceTo(100)
    await place({ followDown: true })
    // Visit above every buy first, then fall through the bottom.
    await priceTo(121)
    await priceTo(79)

    const grid = await onlyGrid()
    expect(grid.plan.downShifts).toBe(1)
    expect(grid.plan.topPx).toBeCloseTo(110, 9)
    expect(grid.plan.bottomPx).toBeCloseTo(70, 9)
    expect(grid.plan.levels.map((one) => one.buyPx)).toEqual([70, 80, 90, 100])
    expect(grid.plan.carriedLevels).toHaveLength(1)
    expect(grid.plan.carriedLevels[0].buyPx).toBe(110)
    expect(grid.plan.carriedLevels[0].sellPx).toBe(120)
    // The new $70 level starts on the next pass. The crash itself only buys
    // the four prices the grid was already watching.
    expect(grid.plan.levels[0].status).toBe("waiting")
  })

  it("forgets a carried holding that was already closed by hand", async () => {
    await priceTo(100)
    await place({ followDown: true })
    await priceTo(121)
    await priceTo(79)
    expect((await onlyGrid()).plan.carriedLevels).toHaveLength(1)

    // The exchange position is the truth. Leave less than one level behind,
    // as if most of the position was closed by hand, then cross every sell.
    await database
      .update(tradePaperPositions)
      .set({ szi: 1 })
      .where(eq(tradePaperPositions.userId, userId))
    await priceTo(121)

    expect((await onlyGrid()).plan.carriedLevels).toHaveLength(0)
  })

  it("takes one step per pass after a crash through several ranges", async () => {
    await priceTo(100)
    await place({ followDown: true })
    await priceTo(121)
    await priceTo(5)
    expect((await onlyGrid()).plan.downShifts).toBe(1)

    await settle()
    expect((await onlyGrid()).plan.downShifts).toBe(2)
  })

  it("leaves the stop at its original price while the range moves through it", async () => {
    await priceTo(100)
    await place({
      followDown: true,
      stopLoss: { underPct: 5, base: null },
    })
    await priceTo(121)
    const before = gridStopPx((await onlyGrid()).plan)
    await priceTo(79)

    const grid = await onlyGrid()
    expect(before).toBeCloseTo(76, 9)
    expect(gridStopPx(grid.plan)).toBeCloseTo(76, 9)
    expect(grid.plan.bottomPx).toBeCloseTo(70, 9)
    expect(grid.plan.levels[0].dead).toBe(true)
  })

  it("pauses before a lower level would reach an invalid price", async () => {
    await priceTo(100)
    await place({ followDown: true })
    await priceTo(121)
    await priceTo(1)
    for (let pass = 0; pass < 8; pass += 1) await settle()

    const grid = await onlyGrid()
    expect(grid.plan.paused).toBe(true)
    expect(grid.plan.pauseReason).toContain("price step")
    expect(grid.plan.bottomPx).toBeCloseTo(10, 9)
  })

  it("pauses when the exchange's new minimum makes the lower buys too small", async () => {
    await priceTo(100)
    await place({ followDown: true })
    await priceTo(121)
    const before = await onlyGrid()
    await database
      .update(tradeSmartLadders)
      .set({ plan: { ...before.plan, minOrderValueUsd: 600 } })
      .where(eq(tradeSmartLadders.id, before.id))

    await priceTo(79)

    const grid = await onlyGrid()
    expect(grid.plan.paused).toBe(true)
    expect(grid.plan.pauseReason).toContain("smaller than this market accepts")
    expect(grid.plan.downShifts).toBe(0)
  })
})
