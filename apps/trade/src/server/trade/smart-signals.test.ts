import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { isMarketable } from "@/lib/trade/paper"
import {
  CHASE_EVERY_MS,
  type SignalPlan,
} from "@/lib/trade/signal-order"
import type { TradeWallet } from "@/lib/trade/wallets"
import { type CustomShellDb } from "@/server/db"
import { createTestDatabase, insertUser } from "@/server/test-support"
import { clearMarketRulesCache } from "@/server/trade/market-rules"
import { loadPaperPortfolio } from "@/server/trade/paper"
import { resetChaseGate } from "@/server/trade/smart-signals"
import {
  tradePaperOrders,
  tradePaperPositions,
  tradeSmartLadders,
  tradeWallets,
} from "@/server/trade/schema"

/**
 * What a signal trade does as price moves, driven through real settles rather
 * than by calling the engine directly — the same way the ladder and grid suites
 * work, because the interesting failures are all in how the engine reads what
 * the settle just did.
 *
 * **The claim these tests exist to defend is that nothing is ever taken at the
 * market price.** Every order this places has to sit on the wrong side of the
 * price to be an order at all, and the first test says so directly.
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

/** An arrow at $100, following a price that runs by at most 2%. */
function plan(over: Partial<SignalPlan> = {}): SignalPlan {
  return {
    signalPx: 100,
    signalAt: 1_000,
    chaseGiveUp: 0.02,
    stakeUsd: 1_000,
    sizeDecimals: 3,
    maxLeverage: 50,
    phase: "buying",
    orderId: null,
    orderPx: null,
    chasedAt: 0,
    chases: 0,
    startedAt: 0,
    ...over,
  }
}

async function startTrade(over: Partial<SignalPlan> = {}) {
  await database.insert(tradeSmartLadders).values({
    userId,
    id: "s1",
    walletId: "w1",
    marketKey: BTC,
    kind: "signal",
    status: "active",
    plan: plan(over),
  })
}

/** Settles everything — the read every pass of the engine makes. */
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

async function row() {
  const rows = await database
    .select()
    .from(tradeSmartLadders)
    .where(eq(tradeSmartLadders.userId, userId))
  expect(rows).toHaveLength(1)
  return { ...rows[0], plan: rows[0].plan as SignalPlan }
}

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  clearMarketRulesCache()
  resetChaseGate()
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

/** Lets the wallet's chase gate expire, so the next settle may move an order. */
function waitOutTheGate() {
  vi.setSystemTime(new Date(Date.now() + CHASE_EVERY_MS + 1_000))
}

describe("buying on an arrow", () => {
  it("asks for a price rather than taking one", async () => {
    // The whole claim of this step in one assertion: an order priced at or
    // through the market fills instantly and is a market order by another name.
    await startTrade()
    await settle()

    const [order] = await orders()
    expect(order.side).toBe("buy")
    expect(order.px).toBeLessThan(100)
    expect(isMarketable("buy", order.px, 100)).toBe(false)
    expect(await positions()).toHaveLength(0)
  })

  it("spends what it was given, and no more", async () => {
    await startTrade({ stakeUsd: 1_000 })
    await settle()

    const [order] = await orders()
    expect(order.px * order.sz).toBeLessThanOrEqual(1_000)
    // And close to it — a stake that quietly bought a tenth of what it said
    // would look like it worked.
    expect(order.px * order.sz).toBeGreaterThan(990)
  })

  it("fills when price comes to it, and then holds", async () => {
    await startTrade()
    await settle()
    const [resting] = await orders()

    await priceTo(resting.px)

    expect(await orders()).toHaveLength(0)
    const held = await positions()
    expect(held).toHaveLength(1)
    expect(held[0].szi).toBeGreaterThan(0)
    expect((await row()).plan.phase).toBe("holding")
  })

  it("follows a price that runs away", async () => {
    await startTrade()
    await settle()
    const first = (await orders())[0].px

    waitOutTheGate()
    await priceTo(101)

    const second = (await orders())[0].px
    expect(second).toBeGreaterThan(first)
    expect(isMarketable("buy", second, 101)).toBe(false)
    expect((await row()).plan.chases).toBe(1)
  })

  it("never follows past the limit, even while it is still following", async () => {
    // $100 plus 2% is $102, so no order this plan places may ever ask more.
    await startTrade({ chaseGiveUp: 0.02 })
    await settle()

    waitOutTheGate()
    await priceTo(101.9)

    expect((await orders())[0].px).toBeLessThanOrEqual(102)
  })

  it("gives up when price runs past the limit, and buys nothing", async () => {
    await startTrade({ chaseGiveUp: 0.02 })
    await settle()
    expect(await orders()).toHaveLength(1)

    waitOutTheGate()
    await priceTo(102.5)

    expect(await orders()).toHaveLength(0)
    expect(await positions()).toHaveLength(0)
    const rows = await database
      .select()
      .from(tradeSmartLadders)
      .where(eq(tradeSmartLadders.userId, userId))
    expect(rows[0].status).toBe("done")
  })

  it("at zero, buys only while price is still at the arrow", async () => {
    // Zero is a real answer and it is the strictest one: buy at the arrow's
    // price or better, and the moment price leaves, forget this arrow. It is
    // not "wait forever for price to come back" — an order left resting
    // indefinitely holds cash for a fill that may never come.
    await startTrade({ chaseGiveUp: 0 })
    await settle()
    const first = (await orders())[0].px
    expect(first).toBeLessThan(100)

    // Above the arrow by any amount at all: the arrow is dropped. (Price
    // falling instead would simply fill it, which "fills when price comes to
    // it" already covers.)
    waitOutTheGate()
    await priceTo(100.5)
    expect(await orders()).toHaveLength(0)
    expect(await positions()).toHaveLength(0)
  })

  it("will not move an order twice inside the gate", async () => {
    // The rate limit, and it is the reason a chase is affordable at all:
    // moving an order costs a cancel and a place, and the exchange's whole
    // allowance is about sixty order calls a minute.
    await startTrade()
    await settle()
    const first = (await orders())[0].px

    await priceTo(100.6)
    await priceTo(100.9)

    expect((await orders())[0].px).toBe(first)
    expect((await row()).plan.chases).toBe(0)
  })

  it("leaves a hair-width wobble alone", async () => {
    await startTrade()
    await settle()
    const first = (await orders())[0].px

    waitOutTheGate()
    await priceTo(100.01)

    expect((await orders())[0].px).toBe(first)
  })
})

describe("selling on an arrow", () => {
  async function holding() {
    await startTrade()
    await settle()
    const [resting] = await orders()
    await priceTo(resting.px)
    await database
      .update(tradeSmartLadders)
      .set({ plan: { ...(await row()).plan, phase: "selling" } })
      .where(eq(tradeSmartLadders.userId, userId))
    return resting.px
  }

  it("asks for a price on the way out too", async () => {
    const at = await holding()
    await settle()

    const [order] = await orders()
    expect(order.side).toBe("sell")
    expect(order.reduceOnly).toBe(true)
    expect(order.px).toBeGreaterThan(marks.get("BTC") as number)
    expect(isMarketable("sell", order.px, marks.get("BTC") as number)).toBe(
      false
    )
    expect(at).toBeGreaterThan(0)
  })

  it("sells the whole position, not the stake", async () => {
    await holding()
    await settle()

    const [held] = await positions()
    expect((await orders())[0].sz).toBeCloseTo(Math.abs(held.szi), 3)
  })

  it("never gives up, however far price runs", async () => {
    await holding()
    await settle()

    // Down 20%, which for a buy would be far past any give-up. A sell has no
    // give-up at all: being half out of a position is worse than the price.
    waitOutTheGate()
    await priceTo(80)

    const [order] = await orders()
    expect(order.side).toBe("sell")
    expect(order.px).toBeGreaterThan(80)
    const rows = await database
      .select()
      .from(tradeSmartLadders)
      .where(eq(tradeSmartLadders.userId, userId))
    expect(rows[0].status).toBe("active")
  })

  it("is finished once it is out", async () => {
    await holding()
    await settle()
    const [order] = await orders()

    await priceTo(order.px)

    expect(await positions()).toHaveLength(0)
    const rows = await database
      .select()
      .from(tradeSmartLadders)
      .where(eq(tradeSmartLadders.userId, userId))
    expect(rows[0].status).toBe("done")
  })
})

describe("when the flow is switched off", () => {
  it("takes back an order it had asked for and never got", async () => {
    // A flow somebody switched off must not carry on and buy. Stopping marks
    // the plan; the cancelling itself is this engine's next pass, so it goes
    // through the same path a give-up already uses in both lanes.
    await startTrade()
    await settle()
    expect(await orders()).toHaveLength(1)

    await database
      .update(tradeSmartLadders)
      .set({ plan: { ...(await row()).plan, phase: "stopping" } })
      .where(eq(tradeSmartLadders.userId, userId))
    await settle()

    expect(await orders()).toHaveLength(0)
    expect(await positions()).toHaveLength(0)
    const rows = await database
      .select()
      .from(tradeSmartLadders)
      .where(eq(tradeSmartLadders.userId, userId))
    expect(rows[0].status).toBe("done")
  })

  it("leaves a position it already holds exactly where it is", async () => {
    // The same rule a stopped ladder follows. Worth knowing: a signal position
    // has no stop and no target, so from here nothing will sell it — its only
    // exit was the next arrow, and there are no more arrows.
    await startTrade()
    await settle()
    const [resting] = await orders()
    await priceTo(resting.px)
    expect(await positions()).toHaveLength(1)

    await database
      .update(tradeSmartLadders)
      .set({ plan: { ...(await row()).plan, phase: "stopping" } })
      .where(eq(tradeSmartLadders.userId, userId))
    await settle()

    const held = await positions()
    expect(held).toHaveLength(1)
    expect(held[0].szi).toBeGreaterThan(0)
  })
})

describe("when the coin is not this plan's to trade", () => {
  it("stands down on a short somebody else opened", async () => {
    await database.insert(tradePaperPositions).values({
      userId,
      id: BTC,
      walletId: "w1",
      marketKey: BTC,
      szi: -1,
      entryPx: 100,
      leverage: 1,
      maxLeverage: 50,
      tpPx: null,
      slPx: null,
      feesPaid: 0,
    })
    await startTrade()
    await settle()

    // Buying would shrink their short and selling would grow it. Neither is
    // what anybody meant by an arrow on this coin.
    expect(await orders()).toHaveLength(0)
    const rows = await database
      .select()
      .from(tradeSmartLadders)
      .where(eq(tradeSmartLadders.userId, userId))
    expect(rows[0].status).toBe("done")
  })

  it("is finished when the position goes some other way", async () => {
    // A hand closed it, or a liquidation took it. Either way there is nothing
    // left for this plan to have an opinion about.
    await startTrade({ phase: "holding" })
    await settle()

    const rows = await database
      .select()
      .from(tradeSmartLadders)
      .where(eq(tradeSmartLadders.userId, userId))
    expect(rows[0].status).toBe("done")
  })
})
