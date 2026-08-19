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
    tpPx: null,
    slPx: null,
    reduceOnly: false,
    chaseGiveUp: 0,
    phase: "waiting",
    orderId: null,
    orderPx: null,
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
