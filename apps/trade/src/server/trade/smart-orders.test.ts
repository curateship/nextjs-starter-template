import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { CandleBar } from "@/lib/protocols/contracts"
import type { DcaParams, LadderPlan } from "@/lib/trade/dca"
import type { TradeWallet } from "@/lib/trade/wallets"
import { type CustomShellDb } from "@/server/db"
import { createTestDatabase, insertUser } from "@/server/test-support"
import { clearMarketRulesCache } from "@/server/trade/market-rules"
import {
  loadPaperPortfolio,
  placePaperOrder,
  setPaperBrackets,
} from "@/server/trade/paper"
import { loadSmartDca, saveSmartDca } from "@/server/trade/prefs"
import {
  cancelLadderRest,
  cancelLadderRung,
  listActiveLadders,
  placeDcaLadder,
  updateLadderExits,
} from "@/server/trade/smart-orders"
import {
  tradePaperJournal,
  tradePaperOrders,
  tradePaperPositions,
  tradePrefs,
  tradeSmartLadders,
  tradeWallets,
} from "@/server/trade/schema"

// The exchange is a mock, the same way the engine's own tests mock it: a
// catalogue of rules, today's prices, and whatever candles a case scripts.
const marks = new Map<string, number>([["BTC", 100]])
let candles: CandleBar[] = []

vi.mock("@/server/protocols/registry", () => ({
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
            price: marks.get("BTC") ?? 100,
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
const MINUTE = 60_000

let client: PGlite
let database: CustomShellDb
let userId: string
let wallet: TradeWallet

/** Two rungs from a $100 click: buys at 95 and 87.4, sized 1:2 from 20%. */
function params(over: Partial<DcaParams> = {}): DcaParams {
  return {
    rungs: [{ deviation: 5 }, { deviation: 8 }],
    maxPositionPct: 20,
    sizeMultiplier: 2,
    maxOrderVolPct: 0,
    twoGreen: false,
    takeProfit: null,
    stopLoss: null,
    ...over,
  }
}

async function place(over: Partial<DcaParams> = {}, anchorPx = 100) {
  return await placeDcaLadder(userId, wallet, {
    marketKey: BTC,
    anchorPx,
    interval: "1m",
    params: params(over),
  })
}

/** Settles everything — the read every poll makes. */
async function settle() {
  await loadPaperPortfolio(userId, [wallet])
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

async function journal() {
  return await database
    .select()
    .from(tradePaperJournal)
    .where(eq(tradePaperJournal.userId, userId))
}

async function ladderRows() {
  return await database
    .select()
    .from(tradeSmartLadders)
    .where(eq(tradeSmartLadders.userId, userId))
}

async function onlyLadder() {
  const rows = await ladderRows()
  expect(rows).toHaveLength(1)
  return { ...rows[0], plan: rows[0].plan as LadderPlan }
}

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  clearMarketRulesCache()
  marks.set("BTC", 100)
  candles = []

  userId = (await insertUser(database)).id
  await database.insert(tradeWallets).values({
    userId,
    id: "w1",
    label: "Practice",
    kind: "paper",
    protocol: "hyperliquid",
    network: "mainnet",
    startingBalance: 10_000,
  })
  wallet = {
    id: "w1",
    label: "Practice",
    kind: "paper",
    protocol: "hyperliquid",
    network: "mainnet",
    startingBalance: 10_000,
    address: null,
    hasKey: false,
  }
})

afterEach(async () => {
  await client.close()
})

describe("placing a ladder", () => {
  it("rests every rung below the market as its own buy, sized by the ramp", async () => {
    const placed = await place()
    expect(placed).toEqual({ placed: 2, filledNow: 0 })

    const resting = (await orders()).sort((a, b) => b.px - a.px)
    expect(resting).toHaveLength(2)
    expect(resting[0]).toMatchObject({
      side: "buy",
      px: 95,
      sz: 7.017,
      leverage: 1,
      reduceOnly: false,
    })
    expect(resting[1].px).toBeCloseTo(87.4, 9)
    expect(resting[1].sz).toBeCloseTo(15.255, 9)

    const ladder = await onlyLadder()
    expect(ladder.status).toBe("active")
    expect(ladder.plan.rungs.map((rung) => rung.status)).toEqual([
      "waiting",
      "waiting",
    ])
    expect(ladder.plan.rungs.map((rung) => rung.orderId)).toEqual(
      expect.arrayContaining(resting.map((row) => row.id))
    )
  })

  it("buys the rungs a click above the market straight away, and aims the target", async () => {
    const placed = await place({ takeProfit: { mode: "average", pct: 2 } }, 110)
    expect(placed.filledNow).toBe(1)

    const held = await positions()
    expect(held).toHaveLength(1)
    // Taken at the market's price, never at the worse one asked for.
    expect(held[0].entryPx).toBe(100)
    expect(held[0].tpPx).toBeCloseTo(102, 9)

    const rows = await journal()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ side: "buy", px: 100, reason: "order" })
    // The deeper rung still waits.
    expect(await orders()).toHaveLength(1)
  })

  it("refuses a ladder that costs more than the free cash, writing nothing", async () => {
    // Half the account is already margin behind a position.
    await placePaperOrder(userId, wallet, {
      marketKey: BTC,
      side: "buy",
      px: 100,
      sz: 50,
      leverage: 1,
      reduceOnly: false,
      tpPx: null,
      slPx: null,
    })

    await expect(place({ maxPositionPct: 100 })).rejects.toThrow(
      "SMART_LADDER_COST"
    )
    expect(await ladderRows()).toHaveLength(0)
    expect(await orders()).toHaveLength(0)
  })

  it("refuses a rung too small to be an order, naming it, writing nothing", async () => {
    await expect(place({ maxPositionPct: 0.001 })).rejects.toThrow(
      "SMART_RUNG_TOO_SMALL:1"
    )
    expect(await ladderRows()).toHaveLength(0)
    expect(await orders()).toHaveLength(0)
  })

  it("refuses a second live ladder on the same market", async () => {
    await place()
    await expect(place()).rejects.toThrow("SMART_LADDER_EXISTS")
    expect(await ladderRows()).toHaveLength(1)
  })

  it("counts the whole ladder against the fifty-order cap", async () => {
    await database.insert(tradePaperOrders).values(
      Array.from({ length: 49 }, (_, index) => ({
        userId,
        id: `stuffing-${index}`,
        walletId: wallet.id,
        marketKey: BTC,
        side: "buy" as const,
        px: 10,
        sz: 1,
        leverage: 1,
        maxLeverage: 50,
        reduceOnly: false,
        tpPx: null,
        slPx: null,
      }))
    )
    await expect(place()).rejects.toThrow("PAPER_ORDER_LIMIT")
    expect(await ladderRows()).toHaveLength(0)
  })
})

describe("the ladder at work", () => {
  it("rests each bought rung's sell at the rung above, and ends when all sold", async () => {
    await place({ takeProfit: { mode: "prevRung", pct: 2 } })

    marks.set("BTC", 95)
    await settle()

    let ladder = await onlyLadder()
    expect(ladder.plan.rungs[0].status).toBe("filled")
    expect(ladder.plan.rungs[0].sellOrderId).not.toBeNull()
    expect(ladder.plan.rungs[1].status).toBe("waiting")

    const sells = (await orders()).filter((row) => row.side === "sell")
    expect(sells).toHaveLength(1)
    // The first rung's sell rests at the click itself.
    expect(sells[0]).toMatchObject({ px: 100, reduceOnly: true })
    expect(sells[0].sz).toBeCloseTo(7.017, 9)

    // Price returns: the sell fills, the position is flat, the ladder is over
    // and the deeper rung is cancelled rather than left to re-buy.
    marks.set("BTC", 100)
    await settle()

    ladder = await onlyLadder()
    expect(ladder.status).toBe("done")
    expect(ladder.plan.rungs[1].status).toBe("cancelled")
    expect(await orders()).toHaveLength(0)
    expect(await positions()).toHaveLength(0)
  })

  it("slides the sell-everything target down as deeper rungs fill", async () => {
    await place({ takeProfit: { mode: "nearestRung", pct: 2 } })

    marks.set("BTC", 95)
    await settle()
    expect((await positions())[0].tpPx).toBeCloseTo(100, 9)

    marks.set("BTC", 87.4)
    await settle()
    expect((await positions())[0].tpPx).toBeCloseTo(95, 9)
  })

  it("re-aims the average-price target after every fill", async () => {
    await place({ takeProfit: { mode: "average", pct: 2 } })

    marks.set("BTC", 95)
    await settle()
    let held = (await positions())[0]
    expect(held.tpPx).toBeCloseTo(95 * 1.02, 9)

    marks.set("BTC", 87.4)
    await settle()
    held = (await positions())[0]
    expect(held.tpPx).toBeCloseTo(held.entryPx * 1.02, 9)
  })

  it("keeps the stop under the average, takes rungs beneath it off the book, and ends the ladder when it fires", async () => {
    await place({ stopLoss: { pct: 1 } })

    marks.set("BTC", 95)
    await settle()

    const held = (await positions())[0]
    // One buy at 95, so the average is 95 and the stop 1% under it.
    expect(held.slPx).toBeCloseTo(95 * 0.99, 9)

    // The deeper rung sits below the stop: alive in the plan, off the book.
    let ladder = await onlyLadder()
    expect(ladder.plan.rungs[1].dead).toBe(true)
    expect(ladder.plan.rungs[1].status).toBe("waiting")
    expect(await orders()).toHaveLength(0)

    // The stop fires — everything sells, the dead rung never buys.
    marks.set("BTC", 93)
    await settle()

    ladder = await onlyLadder()
    expect(ladder.status).toBe("done")
    expect(ladder.plan.rungs[1].status).toBe("cancelled")
    expect(await positions()).toHaveLength(0)
    const reasons = (await journal()).map((row) => row.reason)
    expect(reasons).toContain("stop_loss")
  })

  it("wakes the rungs under a stop that was cleared by hand", async () => {
    await place({ stopLoss: { pct: 1 } })
    marks.set("BTC", 95)
    await settle()
    expect(await orders()).toHaveLength(0)

    // Clearing the stop by hand: the ladder stops following, the rung wakes.
    await setPaperBrackets(userId, wallet, {
      marketKey: BTC,
      tpPx: null,
      slPx: null,
    })
    await settle()

    const ladder = await onlyLadder()
    expect(ladder.plan.stopLoss?.mode).toBe("fixed")
    expect(ladder.plan.rungs[1].dead).toBe(false)
    const resting = await orders()
    expect(resting).toHaveLength(1)
    expect(resting[0].px).toBeCloseTo(87.4, 9)
  })

  it("watches its candles in two-green mode and buys on the second green close", async () => {
    await place({ twoGreen: true })
    expect(await orders()).toHaveLength(0)

    // The ladder was placed ten minutes ago; three one-minute candles have
    // closed since — a red dip that reaches the first rung, then two greens.
    await database
      .update(tradeSmartLadders)
      .set({ createdAt: new Date(Date.now() - 10 * MINUTE) })
      .where(eq(tradeSmartLadders.userId, userId))
    const base = Date.now() - 4 * MINUTE
    candles = [
      { openTime: base, open: 96, high: 96, low: 94.9, close: 94.95, volume: 1 },
      {
        openTime: base + MINUTE,
        open: 94.95,
        high: 95.5,
        low: 94.9,
        close: 95.5,
        volume: 1,
      },
      {
        openTime: base + 2 * MINUTE,
        open: 95.5,
        high: 96,
        low: 95.4,
        close: 96,
        volume: 1,
      },
    ]
    await settle()

    const held = await positions()
    expect(held).toHaveLength(1)
    // Bought at the confirming candle's close, not at the rung's line.
    expect(held[0].entryPx).toBeCloseTo(96, 9)
    expect(held[0].szi).toBeCloseTo(7.017, 9)
    const ladder = await onlyLadder()
    expect(ladder.plan.rungs[0].status).toBe("filled")
    expect(ladder.plan.rungs[1].status).toBe("waiting")
    expect(await orders()).toHaveLength(0)

    // Settling again changes nothing — the candles were already read.
    await settle()
    expect(await journal()).toHaveLength(1)
  })

  it("marks a rung that could not afford its buy, rather than losing it", async () => {
    await place()

    // The cash goes somewhere else: a manual position takes nearly all of it,
    // so when price reaches the first rung there is no margin left for it.
    await placePaperOrder(userId, wallet, {
      marketKey: BTC,
      side: "buy",
      px: 100,
      sz: 95,
      leverage: 1,
      reduceOnly: false,
      tpPx: null,
      slPx: null,
    })

    marks.set("BTC", 95)
    await settle()

    const ladder = await onlyLadder()
    // Not quietly dropped: the rung says it missed, and the chart draws it.
    expect(ladder.plan.rungs[0].status).toBe("skipped")
    expect(ladder.plan.rungs[0].orderId).toBeNull()
    expect(ladder.status).toBe("active")
    // Nothing was bought for it — the ladder never shrank the ask.
    expect(
      (await journal()).filter((row) => row.side === "buy" && row.px === 95)
    ).toHaveLength(0)
  })

  it("calls off one rung, then the rest, and the empty ladder finishes", async () => {
    await place()
    const ladder = await onlyLadder()

    await cancelLadderRung(userId, wallet, { ladderId: ladder.id, rungIndex: 0 })
    let after = await onlyLadder()
    expect(after.plan.rungs[0].status).toBe("cancelled")
    expect(after.status).toBe("active")
    expect(await orders()).toHaveLength(1)

    await cancelLadderRest(userId, wallet, { ladderId: ladder.id })
    after = await onlyLadder()
    expect(after.status).toBe("done")
    expect(await orders()).toHaveLength(0)
  })

  it("rewrites the brackets and the sells when the exits change mid-flight", async () => {
    await place({ takeProfit: { mode: "average", pct: 2 } })
    marks.set("BTC", 95)
    await settle()
    expect((await positions())[0].tpPx).toBeCloseTo(96.9, 9)

    const ladder = await onlyLadder()
    await updateLadderExits(userId, wallet, {
      ladderId: ladder.id,
      takeProfit: { mode: "prevRung", pct: 2 },
      stopLoss: null,
    })

    expect((await positions())[0].tpPx).toBeNull()
    const sells = (await orders()).filter((row) => row.side === "sell")
    expect(sells).toHaveLength(1)
    expect(sells[0].px).toBeCloseTo(100, 9)
    expect((await onlyLadder()).plan.takeProfit?.mode).toBe("prevRung")
  })
})

describe("everything around a ladder", () => {
  it("keeps ladders to their own account", async () => {
    await place()
    const stranger = (await insertUser(database)).id
    expect(await listActiveLadders(stranger, [wallet.id])).toHaveLength(0)
    expect(await listActiveLadders(userId, [wallet.id])).toHaveLength(1)
  })

  it("deleting the wallet takes its ladders with it", async () => {
    await place()
    await database
      .delete(tradeWallets)
      .where(eq(tradeWallets.userId, userId))
    expect(await ladderRows()).toHaveLength(0)
  })

  it("remembers the window's settings, and junk falls back to nothing", async () => {
    expect(await loadSmartDca(userId)).toBeNull()

    const saved = params({ maxPositionPct: 33 })
    await saveSmartDca(userId, saved)
    expect(await loadSmartDca(userId)).toEqual(saved)

    await database
      .update(tradePrefs)
      .set({ smartDca: { anything: true } as never })
      .where(eq(tradePrefs.userId, userId))
    expect(await loadSmartDca(userId)).toBeNull()
  })
})
