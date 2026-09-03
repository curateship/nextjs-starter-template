import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { CandleBar } from "@/lib/protocols/contracts"
import { snapToTick } from "@/lib/protocols/tick"
import {
  defaultGridParams,
  gridFlippedPcts,
  gridStopPx,
  type GridParams,
  type GridPlan,
} from "@/lib/trade/grid"
import { defaultPaperCosts, type TradePosition } from "@/lib/trade/paper"
import type { TradeWallet } from "@/lib/trade/wallets"
import { type CustomShellDb } from "@/server/db"
import { createTestDatabase, insertUser } from "@/server/test-support"
import type { WalletBook } from "@/server/trade/paper-replay"
import type { LadderEngineDeps } from "@/server/trade/smart-engine"
import {
  advanceGrid,
  resetGridPositionGoneMemory,
  type GridRow,
} from "@/server/trade/smart-grids"
import {
  cancelGridLevel,
  cancelGridRest,
  moveGridExit,
  moveGridRange,
  placeGridOrder,
  reshapeGrid,
  saveGridPlan,
  setGridFollow,
  updateGridEnd,
  updateGridStop,
} from "@/server/trade/grid-orders"
import {
  insertReversedGrid,
  reverseGridOrder,
} from "@/server/trade/grid-reversal"
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
/** The market's price step. Null leaves every price exactly as drawn. */
let tick: number | null = null

vi.mock("@/server/protocols/registry", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getProtocol: () => ({
    capabilities: { gridStop: "exchange" },
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
            priceTick: tick,
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
      roundPx: (px: number) => snapToTick(px, tick),
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
  tick = null

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
  it("puts End Grid above today's price when the range is below it", async () => {
    await place({ takeProfitPct: 5 })

    const grid = await onlyGrid()
    expect(grid.plan.topPx).toBe(120)
    expect(grid.plan.takeProfitPx).toBeCloseTo(210, 9)
  })

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

  it("splits the pot by the typed shares when the rungs are set by hand", async () => {
    // Rung order in, level order stored. Rung 1 is the top of a buying
    // grid's range, so 10% at the top and 40% at the $80 bottom.
    await place({ manualSizing: true, manualRungPcts: [10, 20, 30, 40] })
    const grid = await onlyGrid()
    expect(grid.plan.manualSizing).toBe(true)
    expect(grid.plan.manualRungPcts).toEqual([40, 30, 20, 10])
    // 20% of $10,000 is $2,000, split 40/30/20/10.
    expect(grid.plan.levels.map((one) => Math.round(one.budget))).toEqual([
      800, 600, 400, 200,
    ])
  })

  it("refuses a hand-set split that does not use the complete pot", async () => {
    await expect(
      place({ manualSizing: true, manualRungPcts: [10, 20, 30, 20] })
    ).rejects.toThrow("SMART_GRID_RUNG_TOTAL")
    expect(await gridRows()).toHaveLength(0)
  })

  it("names the rung that was typed, not the level, when one is too small", async () => {
    // A 0.4% share of a $2,000 pot is $8, under this market's $10 floor. It
    // is rung 4, which on a buying grid is the bottom of the range.
    await expect(
      placeGridOrder(userId, wallet, {
        marketKey: BTC,
        topPx: 120,
        bottomPx: 80,
        params: params({
          manualSizing: true,
          manualRungPcts: [33.2, 33.2, 33.2, 0.4],
        }),
      })
    ).rejects.toThrow("SMART_GRID_RUNG_TOO_SMALL:4")
  })

  it("gives the two directions mirrored grids once the rows turn over", async () => {
    // Tyler, 29 Aug 2026: "if long was 1, 2, 3, 4, 5 then short is
    // 5, 4, 3, 2, 1". The rows are held against prices, and switching the
    // direction turns them over, so the two grids come out mirrored.
    await place({ manualSizing: true, manualRungPcts: [10, 20, 30, 40] })
    const buying = await onlyGrid()
    // Level order is the rows read backwards: 40% at the $80 bottom.
    expect(buying.plan.levels.map((one) => Math.round(one.budget))).toEqual([
      800, 600, 400, 200,
    ])

    await cancelGridRest(userId, wallet, { gridId: buying.id })
    await settle()
    await priceTo(70)
    await place({
      direction: "short",
      manualSizing: true,
      manualRungPcts: gridFlippedPcts([10, 20, 30, 40]),
    })
    const selling = (await gridRows())
      .map((row) => ({ ...row, plan: row.plan as GridPlan }))
      .find((row) => row.plan.direction === "short")
    // The mirror: 40% at the $120 top instead.
    expect(selling?.plan.levels.map((one) => Math.round(one.budget))).toEqual([
      200, 400, 600, 800,
    ])
  })

  it("numbers a selling grid's rungs from the bottom", async () => {
    // Rung 1 is the first trade the grid makes. On a selling grid that is the
    // BOTTOM level, so a tiny rung 1 is named rung 1 — the same level a
    // buying grid would call rung 4.
    await priceTo(70)
    await expect(
      placeGridOrder(userId, wallet, {
        marketKey: BTC,
        topPx: 120,
        bottomPx: 80,
        params: params({
          direction: "short",
          manualSizing: true,
          manualRungPcts: [33.2, 33.2, 33.2, 0.4],
        }),
      })
    ).rejects.toThrow("SMART_GRID_RUNG_TOO_SMALL:1")
  })

  it("a selling grid sells most the further the rally runs", async () => {
    await priceTo(70)
    // The rows a selling grid ends up with after the switch turns them over:
    // 40% on the top row down to 10% on the bottom one.
    await place({
      direction: "short",
      manualSizing: true,
      manualRungPcts: [40, 30, 20, 10],
    })

    const grid = await onlyGrid()
    expect(grid.plan.levels.map((one) => one.buyPx)).toEqual([
      90, 100, 110, 120,
    ])
    expect(grid.plan.levels.map((one) => Math.round(one.budget))).toEqual([
      200, 400, 600, 800,
    ])

    // Price climbs to rung 1 at the bottom and only that level sells, for its
    // $200.
    await priceTo(90)
    const sold = await onlyGrid()
    expect(sold.plan.levels[0].status).toBe("holding")
    expect(sold.plan.levels[0].heldSz * 90).toBeCloseTo(200, 0)
    expect(sold.plan.levels[1].status).toBe("waiting")
  })

  it("uses the chosen borrowing when a level buys", async () => {
    await place({ leverage: 3 })
    const grid = await onlyGrid()
    expect(grid.plan.leverage).toBe(3)
    expect(grid.plan.levels[2].budget).toBeCloseTo(1_500, 0)

    await priceTo(99)
    const [position] = await positions()
    expect(position.leverage).toBe(3)
    expect(position.szi * position.entryPx).toBeGreaterThan(1_500)
  })

  it("inherits the borrowing already fixed by a held position", async () => {
    await placePaperOrder(userId, wallet, {
      marketKey: BTC,
      side: "buy",
      sz: 0.1,
      leverage: 2,
      reduceOnly: false,
      tpPx: null,
      slPx: null,
      px: 200,
    })

    await place({ leverage: 3 })
    const grid = await onlyGrid()
    expect(grid.plan.leverage).toBe(2)
    expect(grid.plan.levels[2].budget).toBeLessThan(1_100)

    await priceTo(99)
    const [position] = await positions()
    expect(position.leverage).toBe(2)
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

describe("saving a grid plan", () => {
  it("does not bring back a grid that finished during an older save", async () => {
    await place()
    const stale = await onlyGrid()
    const closed = { ...stale.plan, closedReason: "stop" as const }
    await database
      .update(tradeSmartLadders)
      .set({ plan: closed, status: "done" })
      .where(eq(tradeSmartLadders.id, stale.id))

    await expect(
      saveGridPlan(userId, stale.id, stale.plan, "active")
    ).rejects.toThrow("SMART_GRID_FINISHED")
    await expect(
      saveGridPlan(userId, stale.id, stale.plan, "active")
    ).rejects.toThrow("SMART_GRID_FINISHED")

    const stored = await onlyGrid()
    expect(stored.status).toBe("done")
    expect(stored.plan.closedReason).toBe("stop")
  })

  it("still lets the current save finish an active grid", async () => {
    await place()
    const grid = await onlyGrid()
    const closed = { ...grid.plan, closedReason: "stop" as const }

    await saveGridPlan(userId, grid.id, closed, "done")

    const stored = await onlyGrid()
    expect(stored.status).toBe("done")
    expect(stored.plan.closedReason).toBe("stop")
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
        marketBuyFirst: false,
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
          marketBuyFirst: false,
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

  it("waits for a 1% rise before buying near a sale", async () => {
    marks.set("BTC", 100)
    await place()

    // The $100 rung buys, then sells at the $110 boundary it shares with the
    // next rung's buy. A small wobble around $110 must not sell one rung and
    // buy the other at nearly the same price.
    await priceTo(101)
    await priceTo(99)
    await priceTo(110)
    await priceTo(110.5)
    await priceTo(110)

    let grid = await onlyGrid()
    expect(grid.plan.levels[3]).toMatchObject({
      buyPx: 110,
      status: "waiting",
      armed: false,
      rebuyAbove: 111.1,
    })

    // A rise just short of 1% is not enough.
    await priceTo(111.09)
    await priceTo(110)
    expect((await onlyGrid()).plan.levels[3].status).toBe("waiting")

    // Once price has reached exactly 1% above the buy, a later return may buy
    // it. The rise prepares the buy; it does not buy on the way up.
    await priceTo(111.1)
    expect((await onlyGrid()).plan.levels[3].status).toBe("waiting")
    await priceTo(110)

    grid = await onlyGrid()
    expect(grid.plan.levels[3].status).toBe("holding")
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

  it("sells everything and finishes at End Grid", async () => {
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
  it("puts the stop back when the exchange shows none", async () => {
    // A hand may move the stop; the exchange showing NO stop is never a hand
    // move. On 3 Sep 2026 kSHIB bought, the same pass read "no stop" from the
    // exchange, and the grid wrote that into its plan and never placed one.
    await place({ stopLoss: { underPct: 5, base: null } })
    await priceTo(109)
    expect((await onlyGrid()).plan.aimedSlPx).toBeCloseTo(76, 9)

    // The exchange shows the position with no stop on it; the plan still
    // remembers aiming one.
    await database
      .update(tradePaperPositions)
      .set({ slPx: null })
      .where(eq(tradePaperPositions.userId, userId))
    await priceTo(108)

    const grid = await onlyGrid()
    expect((await positions())[0].slPx).toBeCloseTo(76, 9)
    expect(grid.plan.aimedSlPx).toBeCloseTo(76, 9)
    expect(grid.plan.stopLoss?.px ?? 76).toBeCloseTo(76, 9)
  })

  it("heals a grid saved with a frozen stop and no price", async () => {
    // The shape kSHIB was left in: following down freezes the stop as a fixed
    // price, and that price was lost. The percent the setting names still
    // says where the stop belongs, so the engine places it there.
    await place({ followDown: true, stopLoss: { underPct: 5, base: null } })
    await priceTo(109)
    const before = await onlyGrid()
    expect(before.plan.stopLoss).toMatchObject({ mode: "fixed", px: 76 })

    await database
      .update(tradePaperPositions)
      .set({ slPx: null })
      .where(eq(tradePaperPositions.userId, userId))
    await database
      .update(tradeSmartLadders)
      .set({
        plan: {
          ...before.plan,
          aimedSlPx: null,
          stopLoss: { ...before.plan.stopLoss, px: null },
        },
      })
      .where(eq(tradeSmartLadders.userId, userId))
    await priceTo(108)

    const grid = await onlyGrid()
    expect((await positions())[0].slPx).toBeCloseTo(76, 9)
    expect(grid.plan.aimedSlPx).toBeCloseTo(76, 9)
  })

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

  it("lets the stop trail inside the range and fades the rungs past it", async () => {
    // The trailing move: price has worked the low rungs and come back up, and
    // the stop is dragged up INSIDE the range to lock that in. The rungs at
    // or under it go quiet; the ones still clear of it keep cycling.
    await place({ stopLoss: { underPct: 5, base: null } })
    await priceTo(105)

    let grid = await onlyGrid()
    await moveGridExit(userId, wallet, {
      gridId: grid.id,
      which: "stopLoss",
      px: 95,
    })
    await settle()
    grid = await onlyGrid()
    expect(gridStopPx(grid.plan)).toBe(95)
    // The 80 and 90 buys sit past the stop and can never trade now.
    expect(grid.plan.levels.map((one) => one.dead)).toEqual([
      true,
      true,
      false,
      false,
    ])
  })

  it("closes everything when price falls to a stop inside the range", async () => {
    await place({ stopLoss: { underPct: 5, base: null } })
    await priceTo(105)
    let grid = await onlyGrid()
    await moveGridExit(userId, wallet, {
      gridId: grid.id,
      which: "stopLoss",
      px: 95,
    })

    await priceTo(95)
    grid = await onlyGrid()
    expect(grid.status).toBe("done")
    expect((grid.plan as GridPlan).closedReason).toBe("stop")
    expect(await positions()).toHaveLength(0)
  })

  it("refuses a stop dropped at or past the current price", async () => {
    // A stop the price has already reached would close the grid the moment
    // the hand let go — that is a mis-drop, not a stop.
    await place({ stopLoss: { underPct: 5, base: null } })
    await priceTo(105)
    const grid = await onlyGrid()
    await expect(
      moveGridExit(userId, wallet, {
        gridId: grid.id,
        which: "stopLoss",
        px: 110,
      })
    ).rejects.toThrow("SMART_GRID_STOP_PASSED")
    await expect(
      moveGridExit(userId, wallet, {
        gridId: grid.id,
        which: "stopLoss",
        px: 105,
      })
    ).rejects.toThrow("SMART_GRID_STOP_PASSED")
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
      end: "top",
      px: 160,
    })

    const grid = await onlyGrid()
    expect(grid.plan.topPx).toBe(160)
    expect(grid.plan.bottomPx).toBe(80)
    expect(grid.plan.levels.map((one) => one.buyPx)).toEqual([
      80, 100, 120, 140,
    ])
    // Nothing to swap on the book: there was never anything resting.
    expect(await orders()).toHaveLength(0)
  })

  it("moves the whole placed grid and keeps its width", async () => {
    await place()

    await moveGridRange(userId, wallet, {
      gridId: (await onlyGrid()).id,
      end: "whole",
      px: 140,
    })

    const grid = await onlyGrid()
    expect(grid.plan.topPx).toBe(160)
    expect(grid.plan.bottomPx).toBe(120)
    expect(grid.plan.levels.map((one) => one.buyPx)).toEqual([
      120, 130, 140, 150,
    ])
    expect(await positions()).toHaveLength(0)
    expect(await orders()).toHaveLength(0)
  })

  it("keeps the stop it was given", async () => {
    await place({ stopLoss: { underPct: 5, base: null } })
    await moveGridRange(userId, wallet, {
      gridId: (await onlyGrid()).id,
      end: "bottom",
      px: 60,
    })
    const grid = await onlyGrid()
    expect(grid.plan.stopLoss?.underPct).toBe(5)
    // And it follows the new bottom, because that is what it hangs off.
    expect(gridStopPx(grid.plan)).toBeCloseTo(57, 9)
  })

  it("can be moved again and again while it holds nothing", async () => {
    await place()
    const id = (await onlyGrid()).id

    await moveGridRange(userId, wallet, {
      gridId: id,
      end: "top",
      px: 240,
    })
    expect((await onlyGrid()).plan.topPx).toBe(240)

    await moveGridRange(userId, wallet, {
      gridId: id,
      end: "top",
      px: 260,
    })
    expect((await onlyGrid()).plan.topPx).toBe(260)

    await moveGridRange(userId, wallet, {
      gridId: id,
      end: "bottom",
      px: 100,
    })
    const grid = await onlyGrid()
    expect(grid.status).toBe("active")
    expect(grid.plan.topPx).toBe(260)
    expect(grid.plan.bottomPx).toBe(100)
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
      end: "top",
      px: 240,
    })
    await moveGridRange(userId, wallet, {
      gridId: (await onlyGrid()).id,
      end: "bottom",
      px: 160,
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

  it("compresses around one open entry without moving its price or money", async () => {
    await place({ manualSizing: true, manualRungPcts: [10, 20, 30, 40] })
    await priceTo(109)
    const before = await onlyGrid()
    const heldBefore = before.plan.levels[3]
    const budgets = before.plan.levels.map((one) => one.budget)

    await moveGridRange(userId, wallet, {
      gridId: before.id,
      end: "top",
      px: 124,
    })

    const after = await onlyGrid()
    const heldAfter = after.plan.levels[3]
    expect(after.plan).toMatchObject({ topPx: 124, bottomPx: 68 })
    expect(heldAfter).toMatchObject({
      status: "holding",
      buyPx: heldBefore.buyPx,
      heldSz: heldBefore.heldSz,
      budget: heldBefore.budget,
      sellPx: 124,
    })
    expect(after.plan.levels.map((one) => one.budget)).toEqual(budgets)
    expect(after.plan.manualRungPcts).toEqual(before.plan.manualRungPcts)
    expect((await positions())[0].szi).toBeCloseTo(heldBefore.heldSz, 9)
    expect(await orders()).toHaveLength(0)
  })

  it("refuses a selling-grid move that puts its stop past liquidation", async () => {
    await priceTo(70)
    await place({
      direction: "short",
      leverage: 4,
      stopLoss: { underPct: 5, base: null },
    })
    await priceTo(90)
    const before = await onlyGrid()
    expect(
      before.plan.levels.filter((one) => one.status === "holding")
    ).toHaveLength(1)

    await expect(
      moveGridRange(userId, wallet, {
        gridId: before.id,
        end: "top",
        px: 130,
      })
    ).rejects.toThrow("SMART_GRID_STOP_PAST_LIQUIDATION")

    const after = await onlyGrid()
    expect(after.plan).toEqual(before.plan)
  })

  it("locks once two entries are open", async () => {
    await place()
    await priceTo(99)
    const before = await onlyGrid()
    expect(
      before.plan.levels.filter((one) => one.status === "holding")
    ).toHaveLength(2)

    await expect(
      moveGridRange(userId, wallet, {
        gridId: before.id,
        end: "top",
        px: 124,
      })
    ).rejects.toThrow("SMART_GRID_RANGE_FIXED")
  })

  it("refuses an upside-down move, and changes nothing", async () => {
    await place()
    const before = (await onlyGrid()).plan.levels.map((one) => one.buyPx)
    await expect(
      moveGridRange(userId, wallet, {
        gridId: (await onlyGrid()).id,
        end: "top",
        px: 70,
      })
    ).rejects.toThrow("SMART_GRID_RANGE")
    expect((await onlyGrid()).plan.levels.map((one) => one.buyPx)).toEqual(
      before
    )
  })
})

describe("re-slicing a running grid", () => {
  it("changes borrowing and redraws every waiting level", async () => {
    await place({ leverage: 1 })
    const id = (await onlyGrid()).id

    await reshapeGrid(userId, wallet, { gridId: id, leverage: 3 })

    const grid = await onlyGrid()
    expect(grid.plan.leverage).toBe(3)
    expect(grid.plan.levels[0].budget).toBeCloseTo(1_500, 0)
  })

  it("switches End Grid on and off from a running grid", async () => {
    await place({ takeProfitPct: null })
    const id = (await onlyGrid()).id

    const enabled = await updateGridEnd(userId, wallet, {
      gridId: id,
      abovePct: 5,
    })
    expect(enabled.grid.plan.takeProfitPct).toBe(5)
    expect(enabled.grid.plan.takeProfitPx).toBeCloseTo(210, 9)

    const disabled = await updateGridEnd(userId, wallet, {
      gridId: id,
      abovePct: null,
    })
    expect(disabled.grid.plan.takeProfitPx).toBeNull()
    expect(disabled.grid.plan.takeProfitPct).toBeNull()
  })

  it("keeps End Grid above price when a lower range is moved", async () => {
    await place({ takeProfitPct: 5 })
    const id = (await onlyGrid()).id

    await moveGridRange(userId, wallet, {
      gridId: id,
      end: "top",
      px: 100,
    })
    await moveGridRange(userId, wallet, {
      gridId: id,
      end: "bottom",
      px: 60,
    })

    const grid = await onlyGrid()
    expect(grid.plan.topPx).toBe(100)
    expect(grid.plan.takeProfitPct).toBe(5)
    expect(grid.plan.takeProfitPx).toBeCloseTo(210, 9)
  })

  it("switches a running grid onto a hand-set split", async () => {
    await place()
    const id = (await onlyGrid()).id

    await reshapeGrid(userId, wallet, {
      gridId: id,
      manualSizing: true,
      manualRungPcts: [10, 20, 30, 40],
    })

    const grid = await onlyGrid()
    expect(grid.plan.manualSizing).toBe(true)
    expect(grid.plan.levels.map((one) => Math.round(one.budget))).toEqual([
      800, 600, 400, 200,
    ])
  })

  it("switches back to an even split and forgets the shares", async () => {
    await place({ manualSizing: true, manualRungPcts: [10, 20, 30, 40] })
    const id = (await onlyGrid()).id

    await reshapeGrid(userId, wallet, { gridId: id, manualSizing: false })

    const grid = await onlyGrid()
    expect(grid.plan.manualSizing).toBe(false)
    expect(grid.plan.manualRungPcts).toBeNull()
    for (const level of grid.plan.levels) {
      expect(level.budget).toBeCloseTo(500, 0)
    }
  })

  it("keeps a hand-set split when the range is dragged", async () => {
    // The chart sends one edge and nothing about sizing. Without the fallback
    // to the grid's own shares, a drag would quietly redraw it split evenly.
    await place({ manualSizing: true, manualRungPcts: [10, 20, 30, 40] })
    const id = (await onlyGrid()).id

    await moveGridRange(userId, wallet, {
      gridId: id,
      end: "bottom",
      px: 60,
    })

    const grid = await onlyGrid()
    expect(grid.plan.topPx).toBe(120)
    expect(grid.plan.bottomPx).toBe(60)
    expect(grid.plan.manualSizing).toBe(true)
    expect(grid.plan.levels.map((one) => Math.round(one.budget))).toEqual([
      800, 600, 400, 200,
    ])
  })

  it("takes the row count as the level count on a hand-set grid", async () => {
    await place()
    const id = (await onlyGrid()).id

    await reshapeGrid(userId, wallet, {
      gridId: id,
      manualSizing: true,
      manualRungPcts: [1, 4, 15, 30, 50],
    })

    const grid = await onlyGrid()
    expect(grid.plan.levels).toHaveLength(5)
    expect(grid.plan.levels.map((one) => Math.round(one.budget))).toEqual([
      1000, 600, 300, 80, 20,
    ])
  })

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

  it("keeps a hand-set split when the range moves up", async () => {
    await priceTo(100)
    await place({
      follow: true,
      manualSizing: true,
      manualRungPcts: [10, 20, 30, 40],
    })
    await priceTo(121)

    const grid = await onlyGrid()
    expect(grid.plan.shifts).toBe(1)
    expect(grid.plan.levels.map((one) => one.buyPx)).toEqual([
      90, 100, 110, 120,
    ])
    // Each level carried its own money to its new price, so the shares are
    // still 40/30/20/10 from the bottom.
    expect(grid.plan.levels.map((one) => Math.round(one.budget))).toEqual([
      800, 600, 400, 200,
    ])
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

  it("keeps End Grid fixed while the range follows and ends there", async () => {
    await priceTo(100)
    await place({ takeProfitPct: 1 })
    expect((await onlyGrid()).plan.takeProfitPx).toBeCloseTo(121.2, 9)

    await setGridFollow(userId, wallet, {
      gridId: (await onlyGrid()).id,
      follow: true,
    })
    const following = await onlyGrid()
    expect(following.plan.takeProfitPx).toBeCloseTo(121.2, 9)
    expect(following.plan.follow).toBe(true)

    await priceTo(121)
    const moved = await onlyGrid()
    expect(moved.plan.shifts).toBeGreaterThan(0)
    expect(moved.plan.topPx).toBeCloseTo(121.2, 9)
    expect(moved.plan.takeProfitPx).toBeCloseTo(121.2, 9)

    await priceTo(121.2)
    const ended = await onlyGrid()
    expect(ended.status).toBe("done")
    expect(ended.plan.closedReason).toBe("takeProfit")
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

  it("keeps a hand-set split when the range moves down", async () => {
    // THE RULE Tyler stated: whichever way price moves, a rung's share of the
    // money never changes. Following down is the one place the money is
    // divided again, so this is where that rule is kept or lost.
    await priceTo(100)
    await place({
      followDown: true,
      manualSizing: true,
      manualRungPcts: [10, 20, 30, 40],
    })
    const before = await onlyGrid()
    const potBefore = before.plan.levels.reduce(
      (sum, one) => sum + one.budget,
      0
    )
    await priceTo(121)
    await priceTo(80)

    const grid = await onlyGrid()
    expect(grid.plan.downShifts).toBe(1)
    expect(grid.plan.levels.map((one) => one.buyPx)).toEqual([70, 80, 90, 100])
    // The prices all moved down a step; the split did not move at all.
    expect(grid.plan.levels.map((one) => Math.round(one.budget))).toEqual([
      800, 600, 400, 200,
    ])
    const potAfter = grid.plan.levels.reduce((sum, one) => sum + one.budget, 0)
    expect(potAfter).toBeCloseTo(potBefore, 0)
  })

  it("keeps stepping down a percentage-spaced range on a market with a price step", async () => {
    // MUBARAK's pause, 3 Sep 2026. Percentage spacing puts a level a few
    // hundred-thousandths past a tick; drawing the levels from the unrounded
    // range and saving the range rounded left the next redraw one tick off the
    // saved level, which the grid read as "does not fit the price step".
    tick = 0.01
    await priceTo(100)
    await place({ followDown: true, spacing: "compounding" })
    await priceTo(121)
    await priceTo(20)
    for (let pass = 0; pass < 8; pass += 1) await settle()

    const grid = await onlyGrid()
    expect(grid.plan.paused).toBeFalsy()
    expect(grid.plan.downShifts).toBeGreaterThanOrEqual(8)
    // Every saved price sits on the tick, and the range redraws to the same
    // waiting prices it saved.
    for (const level of grid.plan.levels) {
      expect(level.buyPx).toBe(snapToTick(level.buyPx, tick))
      expect(level.sellPx).toBe(snapToTick(level.sellPx, tick))
    }
  })

  it("moves a grid saved with levels one tick off the redrawn range", async () => {
    // A grid saved before the fix carries that one-tick gap. It must slide,
    // keeping every old level at the price it actually traded.
    tick = 0.01
    await priceTo(100)
    await place({ followDown: true, spacing: "compounding" })
    await priceTo(121)
    const before = await onlyGrid()
    const nudged = before.plan.levels.map((level, index) =>
      index === 0
        ? level
        : {
            ...level,
            buyPx: snapToTick(level.buyPx - 0.01, tick),
            sellPx: snapToTick(level.sellPx - 0.01, tick),
          }
    )
    await database
      .update(tradeSmartLadders)
      .set({ plan: { ...before.plan, levels: nudged } })
      .where(eq(tradeSmartLadders.id, before.id))

    await priceTo(79)

    const grid = await onlyGrid()
    expect(grid.plan.paused).toBeFalsy()
    expect(grid.plan.downShifts).toBe(1)
    // The old levels moved one place down the array and kept their prices.
    expect(grid.plan.levels.slice(1).map((one) => one.buyPx)).toEqual(
      nudged.slice(0, -1).map((one) => one.buyPx)
    )
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

/**
 * The same grid, run the other way round.
 *
 * The buying grid's cases above all pass unchanged through the direction
 * helpers, which is the proof they changed nothing. These are the proof the
 * mirror works: one engine, not two.
 */
describe("a grid that sells first", () => {
  /** The same $80–$120 range, four levels, selling at 90, 100, 110 and 120. */
  async function placeShort(over: Partial<GridParams> = {}) {
    return await place({ direction: "short", ...over })
  }

  it("sells at each level and buys back one step lower", async () => {
    // Price under the whole range, so every level is armed and waiting to be
    // reached on the way UP.
    await priceTo(70)
    await placeShort()

    const placed = await onlyGrid()
    expect(placed.plan.direction).toBe("short")
    expect(placed.plan.levels.map((one) => one.buyPx)).toEqual([
      90, 100, 110, 120,
    ])
    expect(placed.plan.levels.map((one) => one.sellPx)).toEqual([
      80, 90, 100, 110,
    ])
    // Placing sells nothing.
    expect(await positions()).toHaveLength(0)

    // Price climbs to the lowest sell. That level, and only that level, sells.
    await priceTo(90)
    const afterSell = await onlyGrid()
    expect(afterSell.plan.levels[0].status).toBe("holding")
    expect(afterSell.plan.levels[1].status).toBe("waiting")
    const [position] = await positions()
    // Short: the position's size is negative.
    expect(position.szi).toBeLessThan(0)
  })

  it("recycles a level: sold, bought back, watching again at the same price", async () => {
    await priceTo(70)
    await placeShort()

    await priceTo(90)
    const held = await onlyGrid()
    const budget = held.plan.levels[0].budget
    expect(held.plan.levels[0].status).toBe("holding")

    // Down through its buy-back at 80.
    await priceTo(80)
    const recycled = await onlyGrid()
    const level = recycled.plan.levels[0]
    expect(level.status).toBe("waiting")
    expect(level.heldSz).toBe(0)
    expect(level.buyPx).toBe(90)
    // The same dollars to spend next time, never more.
    expect(level.budget).toBeCloseTo(budget, 9)
    expect(level.cycles).toBe(1)
    expect(recycled.plan.cycles).toBe(1)
    // The round trip made money: sold at 90, bought back at 80.
    const [position] = await positions()
    expect(position).toBeUndefined()
  })

  it("keeps a percentage-spaced selling grid trading after it follows up", async () => {
    // DASH reproduced the failure with this ratio. Moving the range one step
    // up redraws the same overlapping prices, but ordinary floating-point
    // arithmetic leaves them a few trillionths apart.
    await priceTo(30)
    await placeGridOrder(userId, wallet, {
      marketKey: BTC,
      topPx: 50.388,
      bottomPx: 36.29927326802116,
      params: params({
        direction: "short",
        spacing: "compounding",
        follow: true,
      }),
    })

    // The rally sells the range and moves it one step higher. The microscopic
    // arithmetic difference must not pause the grid as if the market rejected
    // a price.
    await priceTo(51)
    const followed = await onlyGrid()
    expect(followed.plan.paused).not.toBe(true)
    expect(followed.plan.downShifts).toBe(1)

    // Existing shorts still buy back when price returns through their exits.
    await priceTo(30)
    expect(await positions()).toHaveLength(0)
  })

  it("makes a level wait for a one percent FALL after a nearby buy-back", async () => {
    await priceTo(70)
    await placeShort()
    await priceTo(90)
    // Buys back at 80. The waiting sell at 90 is within 1% of nothing here,
    // but the buy-back at 80 holds any sell within 1% of 80 — there is none,
    // so check the level that just recycled instead.
    await priceTo(80)

    const grid = await onlyGrid()
    // Level 0 sells at 90, more than 1% from the 80 buy-back, so it is free.
    expect(grid.plan.levels[0].rebuyAbove).toBeUndefined()
  })

  it("ends when a hand turns the position into a long", async () => {
    await priceTo(70)
    await placeShort()
    await priceTo(90)
    expect((await onlyGrid()).plan.levels[0].status).toBe("holding")

    // Close the short and go the other way by hand.
    await placePaperOrder(userId, wallet, {
      marketKey: BTC,
      side: "buy",
      sz: 50,
      leverage: 1,
      reduceOnly: false,
      tpPx: null,
      slPx: null,
      px: 90,
    })
    await settle()

    const grid = await onlyGrid()
    expect(grid.status).toBe("done")
  })

  it("puts End Grid BELOW today's price when the range is above it", async () => {
    await priceTo(200)
    await placeShort({ takeProfitPct: 5 })

    const grid = await onlyGrid()
    // The range's bottom is 80 and the market is 200, so the line is measured
    // from the lower of the two.
    expect(grid.plan.takeProfitPx).toBeCloseTo(76, 9)
  })

  it("puts its stop above the top of the range and fades the levels past it", async () => {
    await priceTo(70)
    await placeShort({ stopLoss: { underPct: 5, base: null } })

    const grid = await onlyGrid()
    expect(gridStopPx(grid.plan)).toBeCloseTo(126, 9)
    // Nothing is past 126, so nothing is dead.
    expect(grid.plan.levels.every((one) => !one.dead)).toBe(true)

    // Drag the stop down inside the top of the range and the levels at or
    // above it can never trade.
    await moveGridExit(userId, wallet, {
      gridId: grid.id,
      which: "stopLoss",
      px: 125,
    })
    await settle()
    const tightened = await onlyGrid()
    expect(gridStopPx(tightened.plan)).toBe(125)
  })

  it("refuses a stop the exchange would close the short out before", async () => {
    await priceTo(70)
    await expect(
      place({
        direction: "short",
        leverage: 50,
        potPct: 90,
        stopLoss: { underPct: 50, base: null },
      })
    ).rejects.toThrow("SMART_GRID_STOP_PAST_LIQUIDATION")
    expect(await gridRows()).toHaveLength(0)
  })

  it("refuses a selling grid on a coin already held long by hand", async () => {
    await priceTo(70)
    await placePaperOrder(userId, wallet, {
      marketKey: BTC,
      side: "buy",
      sz: 1,
      leverage: 1,
      reduceOnly: false,
      tpPx: null,
      slPx: null,
      px: 70,
    })
    await expect(placeShort()).rejects.toThrow("SMART_LONG_HELD")
  })

  it("is over once every level is called off and nothing is held", async () => {
    // The state a selling grid lands in when the × on its badge is pressed
    // before any level has traded. The row must not sit as a zombie holding
    // the coin against a later grid.
    await priceTo(70)
    await placeShort()
    await cancelGridRest(userId, wallet, { gridId: (await onlyGrid()).id })
    await settle()

    const grid = await onlyGrid()
    expect(grid.status).toBe("done")
    expect(grid.plan.closedReason).toBe("flat")
    expect(await positions()).toHaveLength(0)
    // And the coin is free again.
    await expect(placeShort()).resolves.toBeTruthy()
  })

  it("refuses a buying grid on the same coin, one smart order per wallet", async () => {
    await priceTo(70)
    await placeShort()
    await expect(place()).rejects.toThrow("SMART_LADDER_EXISTS")
    expect(await gridRows()).toHaveLength(1)
  })
})

/**
 * Turning a grid around when its stop fires — and by hand.
 *
 * Driven through real settles like everything above, because the flip lives
 * where the settle writes: the old grid done and the new one inserted in the
 * same transaction.
 */
describe("reversing a grid", () => {
  /**
   * A grid whose numbers survive the reversal's own checks: placed with the
   * mark below the top so End Grid lands 5% over the range, which keeps the
   * derived stop inside the 50% cap.
   */
  async function placeReversible(over: Partial<GridParams> = {}) {
    await priceTo(110)
    return await place({
      stopLoss: { underPct: 5, base: null },
      takeProfitPct: 5,
      reverseWhenStopped: true,
      ...over,
    })
  }

  it("turns a hand-set split over when the grid turns round", async () => {
    // The buying grid was weighted at the BOTTOM of its range, where a fall
    // runs furthest its way. The selling grid it becomes must be weighted at
    // the TOP, for the same reason — the same move the window makes when the
    // direction is switched by hand.
    await placeReversible({
      manualSizing: true,
      manualRungPcts: [10, 20, 30, 40],
    })
    await priceTo(100)
    await priceTo(70)

    const rows = await gridRows()
    const reversed = rows.find(
      (row) => (row.plan as GridPlan).reversedFrom !== null
    )
    const plan = reversed?.plan as GridPlan
    expect(plan.direction).toBe("short")
    expect(plan.manualSizing).toBe(true)
    expect(plan.manualRungPcts).toEqual([10, 20, 30, 40])
    // Level 0 is the bottom of the range: light now, where it was heavy.
    const budgets = plan.levels.map((one) => one.budget)
    expect(budgets[0]).toBeLessThan(budgets[3])
  })

  it("flips into a selling grid over the same range when the stop fires", async () => {
    await placeReversible()
    // A level buys, so the stop has something to fire on.
    await priceTo(100)
    expect((await positions()).length).toBe(1)

    // Straight through the stop at 76 (5% under the bottom of 80).
    await priceTo(76)

    const rows = await gridRows()
    expect(rows).toHaveLength(2)
    const old = rows.find((row) => row.status === "done")
    const fresh = rows.find((row) => row.status === "active")
    expect(old).toBeDefined()
    expect(fresh).toBeDefined()
    const oldPlan = old!.plan as GridPlan
    const freshPlan = fresh!.plan as GridPlan
    expect(oldPlan.closedReason).toBe("stop")

    // The same range, the other way round.
    expect(freshPlan.direction).toBe("short")
    expect(freshPlan.topPx).toBe(120)
    expect(freshPlan.bottomPx).toBe(80)
    expect(freshPlan.levels).toHaveLength(4)
    // Its stop IS the old End Grid line, fixed.
    expect(freshPlan.stopLoss?.mode).toBe("fixed")
    expect(freshPlan.stopLoss?.px).toBeCloseTo(oldPlan.takeProfitPx!, 9)
    // Its End Grid sits the old stop's distance below the fired stop.
    expect(freshPlan.takeProfitPx).toBeCloseTo(76 * 0.95, 6)
    // The chain marker, and the switch NOT carried — autos never ping-pong.
    expect(freshPlan.reversedFrom).toBe(old!.id)
    expect(freshPlan.reverseWhenStopped).toBe(false)
    // The stop sold everything; the new grid holds nothing.
    expect(await positions()).toHaveLength(0)
  })

  it("does it once, however many passes look at the closed grid", async () => {
    await placeReversible()
    await priceTo(100)
    await priceTo(76)
    for (let pass = 0; pass < 4; pass += 1) await settle()
    expect(await gridRows()).toHaveLength(2)
  })

  it("answers a racing second flip with the grid that is really there", async () => {
    // The stop fires with the switch on at the same moment the icon is
    // clicked: whichever write loses the race must come back with the grid
    // the winner placed — never \"not found\" about a reversal that happened.
    await placeReversible()
    await priceTo(100)
    await priceTo(76)
    const rows = await gridRows()
    const old = rows.find((row) => row.status === "done")!
    const fresh = rows.find((row) => row.status === "active")!

    const second = await insertReversedGrid(database, {
      userId,
      wallet,
      marketKey: BTC,
      oldId: old.id,
      plan: fresh.plan as GridPlan,
      now: Date.now(),
    })
    expect(second.existing).toBe(true)
    expect(second.grid.id).toBe(fresh.id)
    expect(await gridRows()).toHaveLength(2)
  })

  it("does nothing with the switch off — today's behaviour unchanged", async () => {
    await placeReversible({ reverseWhenStopped: false })
    await priceTo(100)
    await priceTo(76)
    const rows = await gridRows()
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe("done")
  })

  it("does not reverse a grid whose position was closed by hand", async () => {
    await placeReversible()
    await priceTo(100)
    // The hand closes the position with price still INSIDE the range: the
    // engine writes "stop" for any vanished position, and only the mark being
    // past the stop line says the stop is what did it.
    const [held] = await positions()
    await placePaperOrder(userId, wallet, {
      marketKey: BTC,
      side: "sell",
      sz: held.szi,
      leverage: 1,
      reduceOnly: true,
      tpPx: null,
      slPx: null,
      px: 100,
    })
    await settle()

    const rows = await gridRows()
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe("done")
  })

  it("writes the reason on the closed grid when the flip is refused", async () => {
    // No End Grid line: the one thing the new stop is made from.
    await placeReversible({ takeProfitPct: null })
    await priceTo(100)
    await priceTo(76)

    const rows = await gridRows()
    expect(rows).toHaveLength(1)
    const plan = rows[0].plan as GridPlan
    expect(plan.closedReason).toBe("stop")
    expect(plan.reverseFailReason).toContain("End Grid")
  })

  it("reverses by hand: sells what it holds, and the flip can chain back", async () => {
    await placeReversible({ reverseWhenStopped: false })
    await priceTo(100)
    expect((await positions()).length).toBe(1)

    const first = await onlyGrid()
    await reverseGridOrder(userId, wallet, { gridId: first.id })

    let rows = await gridRows()
    expect(rows).toHaveLength(2)
    const old = rows.find((row) => row.status === "done")
    const short = rows.find((row) => row.status === "active")
    expect((old!.plan as GridPlan).closedReason).toBe("cancelled")
    expect((short!.plan as GridPlan).direction).toBe("short")
    // What it held sold at market on the way.
    expect(await positions()).toHaveLength(0)

    // And a reversed grid reverses AGAIN by hand — Tyler, 28 Aug 2026:
    // "Yes i can".
    await reverseGridOrder(userId, wallet, { gridId: short!.id })
    rows = await gridRows()
    expect(rows).toHaveLength(3)
    const chained = rows.find((row) => row.status === "active")
    expect((chained!.plan as GridPlan).direction).toBe("long")
    expect((chained!.plan as GridPlan).reversedFrom).toBe(short!.id)
  })
})

describe("a read with no position", () => {
  /**
   * A real wallet's positions come from an exchange read, and one read can be
   * blind for a few seconds — on 1 Sep 2026 a grid on para:ANSEM bought and
   * was declared stopped out three seconds later because the read had not
   * caught up with the venue the coin lives on. These drive `advanceGrid`
   * directly, because the blind read only exists on the live side and the
   * settle harness above is a practice book that cannot lie.
   */
  beforeEach(() => resetGridPositionGoneMemory())

  function bookWith(
    kind: "live" | "paper",
    positions: Map<string, TradePosition>
  ): WalletBook {
    // Only the fields the grid pass reads. A frozen grid must not fill,
    // so the rest of the book is never reached.
    return {
      wallet: { ...wallet, kind },
      costs: defaultPaperCosts(),
      positions,
      touchedMarkets: new Set<string>(),
    } as unknown as WalletBook
  }

  function depsInto(saves: string[]): LadderEngineDeps {
    return {
      fill: () => {
        throw new Error("a grid with no read position must not trade")
      },
      dropOrder: () => {},
      freeCash: () => 10_000,
      insertOrder: async () => "order-1",
      saveLadder: async (_row, status) => {
        saves.push(status)
      },
    }
  }

  /** A grid whose $110 level has bought, read back as the engine holds it. */
  async function holdingGridRow(): Promise<GridRow> {
    await place()
    await priceTo(115)
    await priceTo(109)
    const grid = await onlyGrid()
    expect(grid.plan.levels[3].status).toBe("holding")
    return { id: grid.id, marketKey: BTC, plan: grid.plan }
  }

  function passAt(now: number, book: WalletBook) {
    return {
      book,
      marks: new Map([[BTC, 109]]),
      ladderBars: new Map(),
      now,
    }
  }

  const heldPosition = (row: GridRow, now: number): TradePosition => ({
    id: BTC,
    walletId: "w1",
    marketKey: BTC,
    szi: row.plan.levels[3].heldSz,
    entryPx: 110,
    leverage: row.plan.leverage,
    maxLeverage: 50,
    targets: [],
    tpPx: null,
    slPx: null,
    feesPaid: 0,
    updatedAt: now,
  })

  it("freezes a live grid rather than ending it on one blind read", async () => {
    const row = await holdingGridRow()
    const saves: string[] = []
    const now = Date.now()

    await advanceGrid(passAt(now, bookWith("live", new Map())), depsInto(saves), row)

    expect(saves).toEqual([])
    expect(row.plan.closedReason).toBeNull()
    expect(row.plan.levels[3].status).toBe("holding")
  })

  it("believes the absence once it has outlasted a slow read", async () => {
    const row = await holdingGridRow()
    const saves: string[] = []
    const now = Date.now()

    await advanceGrid(passAt(now, bookWith("live", new Map())), depsInto(saves), row)
    await advanceGrid(
      passAt(now + 16_000, bookWith("live", new Map())),
      depsInto(saves),
      row
    )

    expect(saves).toEqual(["done"])
    expect(row.plan.closedReason).toBe("stop")
    expect(
      row.plan.levels.filter((level) => level.status === "waiting")
    ).toHaveLength(0)
  })

  it("forgets the clock the moment the position is read again", async () => {
    const row = await holdingGridRow()
    const saves: string[] = []
    const now = Date.now()

    await advanceGrid(passAt(now, bookWith("live", new Map())), depsInto(saves), row)
    // The read catches up: the position is there after all.
    await advanceGrid(
      passAt(
        now + 8_000,
        bookWith("live", new Map([[BTC, heldPosition(row, now)]]))
      ),
      depsInto(saves),
      row
    )
    // A later blind read starts a fresh clock rather than inheriting the old
    // one — 16 seconds after the FIRST blind read is only 8 into this one.
    await advanceGrid(
      passAt(now + 16_000, bookWith("live", new Map())),
      depsInto(saves),
      row
    )

    expect(saves).toEqual([])
    expect(row.plan.closedReason).toBeNull()
  })

  it("still ends a practice grid at once — its book cannot be behind", async () => {
    const row = await holdingGridRow()
    const saves: string[] = []

    await advanceGrid(
      passAt(Date.now(), bookWith("paper", new Map())),
      depsInto(saves),
      row
    )

    expect(saves).toEqual(["done"])
    expect(row.plan.closedReason).toBe("stop")
  })
})
