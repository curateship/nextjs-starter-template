import { ORDER_GONE_AFTER_MS } from "@/lib/trade/order-presence"
import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { isMarketable } from "@/lib/trade/paper"
import { CHASE_EVERY_MS } from "@/lib/trade/signal-order"
import type { WatchPlan } from "@/lib/trade/watch-order"
import type { TradeWallet } from "@/lib/trade/wallets"
import { type CustomShellDb } from "@/server/db"
import { createTestDatabase, insertUser } from "@/server/test-support"
import { clearMarketRulesCache } from "@/server/trade/market-rules"
import { loadPaperPortfolio } from "@/server/trade/paper"
import { resetWatchChaseGate } from "@/server/trade/smart-watch"
import {
  tradePaperOrders,
  tradePaperPositions,
  tradeSmartLadders,
  tradeWallets,
} from "@/server/trade/schema"

/**
 * A watched price, driven through real settles rather than by calling the
 * engine directly — the same way the ladder, grid and signal suites work.
 *
 * **Two claims these tests exist to defend.** Nothing is sent anywhere until
 * the level is actually touched, and nothing is ever taken at the market price
 * once it is. Both are the whole reason a watch is offered as an alternative
 * to an order resting on the exchange.
 */

const marks = new Map<string, number>([["BTC", 100]])

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
      candles: async () => [],
      roundPx: (px: number) => Math.round(px * 1000) / 1000,
    },
    account: { fetch: async () => null },
  }),
}))

const BTC = "hyperliquid:mainnet:BTC"

let client: PGlite
let database: CustomShellDb
let userId: string
let wallet: TradeWallet

/** A buy waiting at $95, with nothing sent yet. */
function plan(over: Partial<WatchPlan> = {}): WatchPlan {
  return {
    triggerPx: 95,
    side: "buy",
    sz: 1,
    leverage: 1,
    maxLeverage: 50,
    sizeDecimals: 3,
    minOrderSize: null,
    minOrderValueUsd: null,
    priceTick: null,
    tpPx: null,
    slPx: null,
    reduceOnly: false,
    maker: false,
    heldAtStart: 0,
    chaseGiveUp: 0,
    phase: "waiting",
    sent: false,
    orderId: null,
    orderPx: null,
    missingSince: 0,
    heldWhenPlaced: 0,
    chasedAt: 0,
    chases: 0,
    startedAt: 0,
    ...over,
  }
}

async function watchAt(over: Partial<WatchPlan> = {}) {
  await database.insert(tradeSmartLadders).values({
    userId,
    id: "w-1",
    walletId: "w1",
    marketKey: BTC,
    kind: "watch",
    status: "active",
    plan: plan(over),
  })
}

/** Settles everything — the read every pass of the engine makes. */
async function settle() {
  await loadPaperPortfolio(userId, [wallet])
}

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

async function row() {
  const rows = await database
    .select()
    .from(tradeSmartLadders)
    .where(eq(tradeSmartLadders.userId, userId))
  expect(rows).toHaveLength(1)
  return { ...rows[0], plan: rows[0].plan as WatchPlan }
}

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  clearMarketRulesCache()
  resetWatchChaseGate()
  marks.set("BTC", 100)
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-08-16T00:00:00Z"))

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
  vi.useRealTimers()
  await client.close()
})

describe("a price being watched", () => {
  it("sends nothing at all while the price is away from the level", async () => {
    await watchAt()
    await priceTo(120)
    await priceTo(101)

    expect(await orders()).toHaveLength(0)
    expect(await positions()).toHaveLength(0)
    expect((await row()).plan.phase).toBe("waiting")
  })

  it("rests an order once the level is touched, and never takes the market", async () => {
    await watchAt()
    await priceTo(95)

    const [order] = await orders()
    expect(order).toBeDefined()
    // The whole claim: an order on the wrong side of the price cannot have
    // been taken at it.
    expect(isMarketable("buy", order.px, marks.get("BTC") as number)).toBe(false)
    expect((await row()).plan.phase).toBe("taking")
    expect(await positions()).toHaveLength(0)
  })

  it("takes the market when the buy level is already above the price", async () => {
    // **A level the price has gone past cannot be waited for.** Drawing a buy
    // above the market means "get me in, I will pay up to here" — the market
    // is already cheaper, so there is nothing to wait for. A limit at that
    // level would cross the book and a post-only order that crosses is
    // refused, which is why this used to rest just under the market instead
    // and sit there unfilled: on 20 Aug 2026 a buy drawn well above the price
    // bought nothing at all.
    await watchAt({ triggerPx: 105 })
    await priceTo(100)

    const [held] = await positions()
    expect(held).toBeDefined()
    expect(held.szi).toBeCloseTo(1)
    // Bought at the market, not at the level that was drawn.
    expect(held.entryPx).toBeCloseTo(100, 1)
    expect(await orders()).toHaveLength(0)
  })

  it("ends an old watch whose size rounds below one coin step", async () => {
    await watchAt({ triggerPx: 105, sz: 0.000129, sizeDecimals: 3 })

    await priceTo(100)

    expect((await row()).status).toBe("done")
    expect(await orders()).toHaveLength(0)
    expect(await positions()).toHaveLength(0)
  })

  it("takes the market when the sell level is already below the price", async () => {
    // The same rule mirrored. Nothing about a sell makes it different.
    await watchAt({ side: "sell", triggerPx: 95, reduceOnly: false })
    await priceTo(100)

    const [held] = await positions()
    expect(held).toBeDefined()
    expect(held.szi).toBeCloseTo(-1)
    expect(await orders()).toHaveLength(0)
  })

  it("rests rather than taking when price merely arrives at the level", async () => {
    // The other half, so the market-take cannot swallow the ordinary case.
    // Price coming DOWN to a buy level is what a watch is for, and paying the
    // spread there is exactly what resting avoids.
    await watchAt()
    await priceTo(95)

    expect(await orders()).toHaveLength(1)
    expect(await positions()).toHaveLength(0)
  })

  it("keeps waiting at the level when price ticks back away", async () => {
    // What separates a watch from an order that gives up: it stands in for one
    // that would have rested on the exchange until it filled.
    await watchAt()
    await priceTo(95)
    await priceTo(99)

    expect((await row()).status).toBe("active")
    expect(await orders()).toHaveLength(1)
  })

  it("gives up only when it was told how far to follow", async () => {
    await watchAt({ chaseGiveUp: 0.02 })
    await priceTo(95)
    // 2% above the level is 96.90; 99 is past it.
    await priceTo(99)

    expect((await row()).status).toBe("done")
    expect(await orders()).toHaveLength(0)
  })

  it("buys when price comes through, and the trade is over", async () => {
    await watchAt()
    await priceTo(95)
    vi.setSystemTime(new Date(Date.now() + CHASE_EVERY_MS + 1_000))
    await priceTo(90)

    expect(await positions()).toHaveLength(1)
    expect(await orders()).toHaveLength(0)
    expect((await row()).status).toBe("done")
  })

  it("hands the position the stop and target it was set with", async () => {
    // They were chosen when the level was, and nothing else remembers them:
    // the order that fills carries no brackets of its own.
    await watchAt({ tpPx: 110, slPx: 88 })
    await priceTo(95)
    vi.setSystemTime(new Date(Date.now() + CHASE_EVERY_MS + 1_000))
    await priceTo(90)

    const [held] = await positions()
    expect(held.tpPx).toBe(110)
    expect(held.slPx).toBe(88)
  })

  it("never places a second order while the first one's fate is unknown", async () => {
    // **The money bug of 20 Aug 2026, pinned.** An order was placed, and the
    // next pass could not see it — the exchange's open-orders list lags a
    // freshly placed order, and a filled one's position takes a moment to
    // show. The engine read that absence as proof the order was gone and
    // placed a fresh one at full size, every pass, until one $50 watch had
    // bought $150 of coin. A watch that has sent money and lost sight of it
    // must WAIT, not spend again.
    await watchAt({ phase: "taking", sent: true, orderId: null })
    await priceTo(95)
    await priceTo(94)
    await priceTo(93)

    expect(await orders()).toHaveLength(0)
    expect(await positions()).toHaveLength(0)
    expect((await row()).status).toBe("active")
  })

  it("still places when nothing was ever sent, even mid-taking", async () => {
    // The hold is about unaccounted money, not about the phase. A watch that
    // reached its level but could not place that pass — no cash, say — must
    // try again, or it would stand at a touched level doing nothing forever.
    await watchAt({ phase: "taking", sent: false, orderId: null })
    await priceTo(95)

    expect(await orders()).toHaveLength(1)
  })

  it("finishes the moment its lost order turns out to have filled", async () => {
    // The position is the proof. The instant it shows, the watch hands over
    // the stop and target it was keeping and ends — it does not stay stuck
    // just because it once lost sight of the order.
    await watchAt({ phase: "taking", sent: true, orderId: null, tpPx: 110, slPx: 88 })
    await database.insert(tradePaperPositions).values({
      userId,
      id: "p-1",
      walletId: "w1",
      marketKey: BTC,
      szi: 1,
      entryPx: 95,
      leverage: 1,
      maxLeverage: 50,
    })
    await priceTo(96)

    const held = await row()
    expect(held.status).toBe("done")
    const [position] = await positions()
    expect(position.tpPx).toBe(110)
    expect(position.slPx).toBe(88)
    expect(await orders()).toHaveLength(0)
  })

  it("waits out a lagging open-orders list instead of buying again", async () => {
    // **What actually happened to PRL on 20 Aug 2026.** One watch worth $50
    // placed SIX orders between 18:54:30 and 18:54:48, each a few seconds
    // apart at a slightly different price, and three of them filled together
    // when the price arrived. Every pass placed one, because every pass
    // looked for the previous order, did not find it in the exchange's list,
    // and concluded it was gone. The list was simply behind.
    await watchAt()
    await priceTo(95)
    const [placed] = await orders()
    expect(placed).toBeDefined()

    // The list loses sight of the order — exactly the gap the exchange left.
    // The order itself is untouched on the exchange; nothing has filled and
    // nothing has been cancelled.
    for (let pass = 0; pass < 6; pass += 1) {
      await database
        .delete(tradePaperOrders)
        .where(eq(tradePaperOrders.userId, userId))
      vi.setSystemTime(new Date(Date.now() + 2_000))
      await priceTo(95 - pass * 0.01)
      expect(await orders()).toHaveLength(0)
    }

    // Not one replacement in twelve seconds, and the watch is still alive
    // rather than quietly finished.
    expect(await positions()).toHaveLength(0)
    const held = await row()
    expect(held.status).toBe("active")
    expect(held.plan.orderId).toBe(placed.id)
    expect(held.plan.missingSince).toBeGreaterThan(0)
  })

  it("still waits out a lagging list when the coin was already held", async () => {
    // The hole the first version of this fix left. Proof of a fill used to be
    // "there is a position" — but a watch that ADDS to a coin already held
    // sees one from its very first pass, so every absent read read as a fill
    // and the protection did nothing on exactly the coins most likely to be
    // traded twice. What is measured now is the amount held CHANGING.
    await database.insert(tradePaperPositions).values({
      userId,
      id: "p-held",
      walletId: "w1",
      marketKey: BTC,
      szi: 5,
      entryPx: 99,
      leverage: 1,
      maxLeverage: 50,
    })
    await watchAt()
    await priceTo(95)
    const [placed] = await orders()
    expect(placed).toBeDefined()

    await database
      .delete(tradePaperOrders)
      .where(eq(tradePaperOrders.userId, userId))
    vi.setSystemTime(new Date(Date.now() + 2_000))
    await priceTo(94.99)

    // Nothing new placed, and the order is still remembered.
    expect(await orders()).toHaveLength(0)
    expect((await row()).plan.orderId).toBe(placed.id)
  })

  it("lets go of an order that has been missing far too long", async () => {
    // The other half of the rule: a wait with no end would leave a watch
    // holding an id for an order somebody cancelled on the exchange's own
    // website, doing nothing forever.
    await watchAt()
    await priceTo(95)
    expect(await orders()).toHaveLength(1)

    await database
      .delete(tradePaperOrders)
      .where(eq(tradePaperOrders.userId, userId))
    // One pass to notice it is missing — the clock starts when the engine
    // first cannot see it, not when it actually vanished — then long enough
    // that a lagging list is no longer a possible explanation.
    await priceTo(95)
    expect((await row()).plan.orderId).not.toBeNull()

    vi.setSystemTime(new Date(Date.now() + ORDER_GONE_AFTER_MS + 1_000))
    await priceTo(95)

    expect((await row()).plan.orderId).toBeNull()
  })

  it("takes its order back when it is called off", async () => {
    await watchAt()
    await priceTo(95)
    expect(await orders()).toHaveLength(1)

    const held = await row()
    await database
      .update(tradeSmartLadders)
      .set({ plan: { ...held.plan, phase: "stopping" } })
      .where(eq(tradeSmartLadders.id, "w-1"))
    await settle()

    expect(await orders()).toHaveLength(0)
    expect((await row()).status).toBe("done")
  })
})
