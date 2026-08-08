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
const HOUR4 = 14_400_000

/**
 * A tape whose last confirmed base is `level`.
 *
 * Fifty-something 4h candles, because that is what the rule costs: the low has
 * to be the lowest of the 36 before it and then stand for 8 more.
 *
 * `endsAgoMs` is how long ago the newest candle closed, and it matters. The
 * engine only asks for this feed once a 4h bar could have closed since the
 * last look, so a tape that ends a minute ago is one the next settle will not
 * re-read — right in a real market and useless in a test that settles twice in
 * a row.
 *
 * `closes` replaces the closing prices of the newest candles, which is how the
 * buy-back tests script price climbing back over a level.
 */
function tapeWithBase(
  level: number,
  over: { closes?: number[]; endsAgoMs?: number } = {}
): CandleBar[] {
  const lows = [
    ...Array.from({ length: 41 }, () => level * 2),
    level,
    ...Array.from({ length: 18 }, () => level * 1.1),
  ]
  const tail = over.closes ?? []
  const first = lows.length - tail.length
  const start =
    Date.now() - (over.endsAgoMs ?? 5 * 3_600_000) - lows.length * HOUR4
  return lows.map((low, index) => {
    const close = index >= first ? tail[index - first] : low * 1.1
    return {
      openTime: start + index * HOUR4,
      open: close,
      high: Math.max(close, low * 1.2),
      low,
      close,
      volume: 1,
    }
  })
}

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
    anchor: "base",
    takeProfit: null,
    stopLoss: null,
    ...over,
  }
}

async function place(over: Partial<DcaParams> = {}, clickPx = 110) {
  return await placeDcaLadder(userId, wallet, {
    marketKey: BTC,
    clickPx,
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
  // A ladder hangs from the confirmed base, so every test needs one. 100 is
  // the base throughout unless a test swaps the tape, which keeps the rungs
  // at the 95 and 87.4 the rest of this file is written around.
  candles = tapeWithBase(100)

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
    expect(placed).toEqual({ placed: 2, passed: 0 })

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

  it("hangs the ladder from the confirmed base, never from a clicked price", async () => {
    // The tape's base is 100, so rung 1 is a full step below it at 95 and each
    // rung after steps down from the one above. Nothing about where the chart
    // was clicked reaches this.
    expect(await place()).toEqual({ placed: 2, passed: 0 })

    const resting = (await orders()).sort((a, b) => b.px - a.px)
    expect(resting[0].px).toBe(95)
    expect(resting[1].px).toBeCloseTo(87.4, 9)
    expect((await onlyLadder()).plan.anchorPx).toBe(100)
  })

  it("refuses a market with no confirmed base, writing nothing", async () => {
    candles = []
    await expect(place()).rejects.toThrow("SMART_LADDER_NO_BASE")
    expect(await ladderRows()).toHaveLength(0)
    expect(await orders()).toHaveLength(0)
  })

  it("refuses to start once price is already under the base", async () => {
    // The level has gone. A ladder arms when price is at or above a base and
    // buys the fall from there; starting halfway down is a different trade.
    marks.set("BTC", 99)
    await expect(place()).rejects.toThrow("SMART_LADDER_UNDER_BASE")
    expect(await ladderRows()).toHaveLength(0)
    expect(await orders()).toHaveLength(0)
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
    await place({ stopLoss: { pct: 1, base: null } })

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
    await place({ stopLoss: { pct: 1, base: null } })
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

// ----- The stop that rests under the base ---------------------------------

/** The base stop as the winning setup has it: on the level, buy back after a day. */
function baseStop(over: Partial<NonNullable<DcaParams["stopLoss"]>> = {}) {
  return {
    pct: 100,
    base: { underPct: 0, reclaimDays: 1 },
    ...over,
  }
}

describe("a stop that rests under the base", () => {
  it("leaves no stop at all until a base confirms below what is held", async () => {
    await place({ stopLoss: baseStop() })

    marks.set("BTC", 95)
    await settle()

    // The base in force is 100 — above the buy at 95, so it is a place to take
    // profit rather than one to give up. That leaves the percent, and 100%
    // below the entry is a stop price would have to reach zero to hit. So
    // there is no stop, rather than one resting at zero under every rung.
    expect((await positions())[0].slPx).toBeNull()
  })

  it("rests on the base itself, not on a percent from the entry", async () => {
    await place({ stopLoss: baseStop() })
    // Placed off the 100 base, then a lower one confirms — which is what a
    // stop can actually rest under.
    candles = tapeWithBase(90)

    marks.set("BTC", 95)
    await settle()

    expect((await positions())[0].slPx).toBeCloseTo(90, 9)
    expect((await onlyLadder()).plan.baseWatch?.levelPx).toBeCloseTo(90, 9)
  })

  it("rests the chosen percent under the base", async () => {
    await place({ stopLoss: baseStop({ base: { underPct: 2, reclaimDays: 0 } }) })
    // Placed off the 100 base, then a lower one confirms — which is what a
    // stop can actually rest under.
    candles = tapeWithBase(90)
    marks.set("BTC", 95)
    await settle()

    // 2% under a base of 90 is 88.20 — worked out from the level, never from
    // the entry, which is the mistake that put the old app's stop above it.
    expect((await positions())[0].slPx).toBeCloseTo(88.2, 9)
  })

  it("steps the ladder down instead of ending it, and rests only the next rung", async () => {
    await place({ stopLoss: baseStop() })
    // Placed off the 100 base, then a lower one confirms — which is what a
    // stop can actually rest under.
    candles = tapeWithBase(90)

    marks.set("BTC", 95)
    await settle()
    let ladder = await onlyLadder()
    // The deeper rung sits under the stop, so it is off the book for now.
    expect(ladder.plan.rungs[1].dead).toBe(true)
    expect(await orders()).toHaveLength(0)

    // Through the base: the stop takes the rung.
    marks.set("BTC", 89)
    await settle()

    ladder = await onlyLadder()
    expect(ladder.status).toBe("active")
    expect(ladder.plan.steppedDown).toBe(1)
    expect(ladder.plan.rungs[0].status).toBe("sold")
    expect(ladder.plan.rungs[1].status).toBe("waiting")
    expect(ladder.plan.rungs[1].dead).toBe(false)
    expect(await positions()).toHaveLength(0)
    expect((await journal()).map((row) => row.reason)).toContain("stop_loss")

    // The next rung is back on the book, on its own, at its own price.
    const resting = await orders()
    expect(resting).toHaveLength(1)
    expect(resting[0].px).toBeCloseTo(87.4, 9)
  })

  it("is over for good once the last rung is stopped out, and arms no buy-back", async () => {
    await placeDcaLadder(userId, wallet, {
      marketKey: BTC,
      clickPx: 110,
      interval: "1m",
      params: params({ rungs: [{ deviation: 5 }], stopLoss: baseStop() }),
    })
    candles = tapeWithBase(90)

    marks.set("BTC", 95)
    await settle()
    marks.set("BTC", 89)
    await settle()

    const ladder = await onlyLadder()
    expect(ladder.status).toBe("done")
    expect(ladder.plan.reclaim).toBeNull()
    expect(await orders()).toHaveLength(0)
    expect(await positions()).toHaveLength(0)
  })

  it("puts the rung back when price reclaims the level, for the money it was allowed", async () => {
    await place({ stopLoss: baseStop() })
    // Placed off the 100 base, then a lower one confirms — which is what a
    // stop can actually rest under.
    candles = tapeWithBase(90, { endsAgoMs: 48 * 3_600_000 })
    marks.set("BTC", 95)
    await settle()

    const budget = (await onlyLadder()).plan.rungs[0].budget
    marks.set("BTC", 89)
    await settle()

    let ladder = await onlyLadder()
    expect(ladder.plan.reclaim).toMatchObject({ rungIndex: 0, aboveSince: null })

    // Ten fresh 4h candles closing above where the stop cut — comfortably past
    // the one day the buy-back waits for.
    candles = tapeWithBase(90, { closes: Array.from({ length: 10 }, () => 96) })
    marks.set("BTC", 96)
    await settle()

    ladder = await onlyLadder()
    expect(ladder.plan.reclaim).toBeNull()
    expect(ladder.plan.rungs[0].status).toBe("filled")

    const held = (await positions())[0]
    // Bought back HIGHER than it was cut, and for the rung's own budget — not
    // for the coin count it used to hold, which at 96 would have cost more.
    expect(held.entryPx).toBeCloseTo(96, 9)
    expect(held.szi * 96).toBeLessThanOrEqual(budget + 0.01)
    expect(held.szi * 96).toBeGreaterThan(budget * 0.99)
  })

  it("starts the buy-back wait again when a candle closes back under the level", async () => {
    await place({ stopLoss: baseStop() })
    // Placed off the 100 base, then a lower one confirms — which is what a
    // stop can actually rest under.
    candles = tapeWithBase(90, { endsAgoMs: 48 * 3_600_000 })
    marks.set("BTC", 95)
    await settle()
    marks.set("BTC", 89)
    await settle()

    // Above it for a while, one close back under, then above again — but only
    // for eight hours, so the wait is nowhere near a day.
    candles = tapeWithBase(90, { closes: [96, 96, 96, 96, 96, 96, 88, 96, 96] })
    marks.set("BTC", 96)
    await settle()

    expect(await positions()).toHaveLength(0)
    expect((await onlyLadder()).plan.reclaim).not.toBeNull()
  })
})

describe("measuring the rungs from the click instead", () => {
  it("hangs the ladder from the clicked price when asked to", async () => {
    // The tape's base is 100 and the click is 80, so choosing the click has
    // to change where every rung lands: 76 rather than 95.
    expect(await place({ anchor: "click" }, 80)).toEqual({
      placed: 2,
      passed: 0,
    })

    const resting = (await orders()).sort((a, b) => b.px - a.px)
    expect(resting[0].px).toBe(76)
    expect((await onlyLadder()).plan.anchorPx).toBe(80)
  })

  it("needs no confirmed base at all", async () => {
    // The same tape that refuses a base-anchored ladder places this one.
    candles = []
    await expect(place()).rejects.toThrow("SMART_LADDER_NO_BASE")
    expect(await place({ anchor: "click" }, 80)).toEqual({
      placed: 2,
      passed: 0,
    })
  })

  it("does not mind price having fallen under the base", async () => {
    // 99 is under the tape's base of 100, which refuses a base-anchored
    // ladder. Measured from a click below the market, it places.
    marks.set("BTC", 99)
    await expect(place()).rejects.toThrow("SMART_LADDER_UNDER_BASE")
    expect(await place({ anchor: "click" }, 90)).toEqual({
      placed: 2,
      passed: 0,
    })
  })

  it("still skips a rung price has already fallen past", async () => {
    // Clicked at 110 with the market at 100: rung 1 lands at 104.50, which
    // price is already below, so it never gets to wait for a drop.
    expect(await place({ anchor: "click" }, 110)).toEqual({
      placed: 1,
      passed: 1,
    })
    expect(await positions()).toHaveLength(0)
    expect((await onlyLadder()).plan.rungs[0].status).toBe("skipped")
  })
})

describe("following the base while nothing has bought", () => {
  it("moves every rung when a new base confirms", async () => {
    await place()
    let ladder = await onlyLadder()
    expect(ladder.plan.anchorPx).toBe(100)
    expect((await orders()).map((row) => row.px).sort((a, b) => b - a)[0]).toBe(95)

    // A lower base confirms, price is still above it, nothing has bought.
    candles = tapeWithBase(90)
    await settle()

    ladder = await onlyLadder()
    expect(ladder.plan.anchorPx).toBe(90)
    const resting = (await orders()).map((row) => row.px).sort((a, b) => b - a)
    // The shape is untouched: still a 5% step then an 8% step, off 90.
    expect(resting[0]).toBeCloseTo(85.5, 9)
    expect(resting[1]).toBeCloseTo(78.66, 9)
  })

  it("stops following the moment a rung buys", async () => {
    await place()
    marks.set("BTC", 95)
    await settle()
    expect((await onlyLadder()).plan.rungs[0].status).toBe("filled")

    candles = tapeWithBase(90)
    await settle()

    // Committed. Re-pricing the deeper rungs under an open position would
    // leave a ladder whose rungs no longer relate to what it paid.
    const ladder = await onlyLadder()
    expect(ladder.plan.anchorPx).toBe(100)
    expect(ladder.plan.rungs[1].px).toBeCloseTo(87.4, 9)
  })

  it("leaves a click-anchored ladder exactly where it was put", async () => {
    await place({ anchor: "click" }, 80)
    candles = tapeWithBase(90)
    await settle()

    expect((await onlyLadder()).plan.anchorPx).toBe(80)
  })
})

describe("two-green mode and rungs above the market", () => {
  it("keeps them, because price being below a rung is what it waits for", async () => {
    // Clicked at 110 with the market at 100, so rung 1 lands at 104.50. A
    // resting ladder would have missed it; this mode is watching for exactly
    // that and buys it on the next confirmation.
    expect(await place({ anchor: "click", twoGreen: true }, 110)).toEqual({
      placed: 2,
      passed: 0,
    })
    const ladder = await onlyLadder()
    expect(ladder.plan.rungs.map((rung) => rung.status)).toEqual([
      "waiting",
      "waiting",
    ])
    // Nothing rests on the book in this mode.
    expect(await orders()).toHaveLength(0)
  })
})
