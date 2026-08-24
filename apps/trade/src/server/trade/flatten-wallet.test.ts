import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { WatchPlan } from "@/lib/trade/watch-order"
import type { TradeWallet } from "@/lib/trade/wallets"
import { type CustomShellDb } from "@/server/db"
import { createTestDatabase, insertUser } from "@/server/test-support"
import { flattenWallet } from "@/server/trade/flatten-wallet"
import { clearMarketRulesCache } from "@/server/trade/market-rules"
import { loadPaperPortfolio, placePaperOrder } from "@/server/trade/paper"
import { resetWatchChaseGate } from "@/server/trade/smart-watch"
import {
  tradePaperOrders,
  tradePaperPositions,
  tradeSmartLadders,
  tradeWallets,
} from "@/server/trade/schema"

/**
 * Emptying one wallet.
 *
 * **The claim these defend is the order of operations.** Selling first leaves a
 * window where a rung waiting below fills and reopens the coin that was just
 * closed, and that is the gap in the existing all-wallets Close all. So every
 * ladder and grid comes off before anything is sold, and a cancel that is
 * refused stops the whole thing rather than selling under a live ladder.
 *
 * **And that the selling is a chase, not a market order.** Every position goes
 * through the same reduce-only maker order a part close uses, which is what
 * `trading-rules.md` asks of a close.
 */

const marks = new Map<string, number>([
  ["BTC", 100],
  ["ETH", 50],
])

/**
 * What the stand-down step answers with, set per test.
 *
 * Mocked rather than arranged, because the interesting rule here is what
 * flatten DOES with a refusal, and a refusal from the real cancels needs an
 * exchange that says no. The cancels themselves are covered by the ladder and
 * grid suites; this file is about the order of the two steps.
 */
const standDown = {
  stood: [] as { id: string; marketKey: string; kind: "dca" | "grid" }[],
  refused: [] as {
    id: string
    marketKey: string
    kind: "dca" | "grid"
    reason: string
  }[],
}

vi.mock("@/server/trade/stand-down", () => ({
  standDownWallet: async () => ({
    stood: standDown.stood,
    refused: standDown.refused,
  }),
}))

vi.mock("@/server/protocols/registry", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getProtocol: () => ({
    id: "hyperliquid",
    label: "Hyperliquid",
    markets: {
      fetch: async () => ({
        protocol: "hyperliquid",
        protocolLabel: "Hyperliquid",
        network: "mainnet",
        networkLabel: "Mainnet",
        rows: [...marks.keys()].map((id) => ({
          key: `hyperliquid:mainnet:${id}`,
          marketId: id,
          symbol: id,
          subExchange: null,
          category: "crypto",
          sizeDecimals: 3,
          maxLeverage: 50,
          isolatedOnly: false,
          iconUrl: null,
          price: marks.get(id) ?? 100,
          change24h: null,
          volume24hUsd: 0,
          fundingHourly: null,
          openInterestUsd: null,
        })),
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
const ETH = "hyperliquid:mainnet:ETH"

let client: PGlite
let database: CustomShellDb
let userId: string
let wallet: TradeWallet
let other: TradeWallet

const words = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

async function settle() {
  await loadPaperPortfolio(userId, [wallet, other])
}

async function open(on: TradeWallet, marketKey: string, sz: number) {
  await placePaperOrder(userId, on, {
    marketKey,
    side: "buy",
    px: marks.get(marketKey.split(":")[2]) as number,
    sz,
    leverage: 1,
    reduceOnly: false,
    tpPx: null,
    slPx: null,
  })
  await settle()
}

async function closes() {
  const rows = await database
    .select()
    .from(tradeSmartLadders)
    .where(eq(tradeSmartLadders.userId, userId))
  return rows
    .filter((row) => row.kind === "watch")
    .map((row) => ({
      walletId: row.walletId,
      marketKey: row.marketKey,
      plan: row.plan as WatchPlan,
    }))
}

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  clearMarketRulesCache()
  resetWatchChaseGate()
  marks.set("BTC", 100)
  marks.set("ETH", 50)
  standDown.stood = []
  standDown.refused = []
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-08-24T00:00:00Z"))

  userId = (await insertUser(database)).id
  const base = {
    kind: "paper" as const,
    status: "active" as const,
    protocol: "hyperliquid" as const,
    network: "mainnet" as const,
    startingBalance: 10_000,
    address: null,
    hasKey: false,
    keyValidUntil: null,
  }
  wallet = { ...base, id: "w1", label: "Main" }
  other = { ...base, id: "w2", label: "Second" }
  await database.insert(tradeWallets).values([
    { userId, id: "w1", label: "Main", ...base },
    { userId, id: "w2", label: "Second", ...base },
  ])
})

afterEach(async () => {
  vi.useRealTimers()
  await client.close()
})

describe("emptying one wallet", () => {
  it("starts a chased close for every position it holds", async () => {
    await open(wallet, BTC, 4)
    await open(wallet, ETH, 6)

    const answer = await flattenWallet(userId, wallet, words)
    expect(answer.cancelRefused).toEqual([])
    expect(answer.sellRefused).toEqual([])
    expect(answer.selling.sort()).toEqual([BTC, ETH].sort())

    const rows = await closes()
    expect(rows).toHaveLength(2)
    for (const row of rows) {
      expect(row.walletId).toBe("w1")
      // The whole position, as a maker, never giving up.
      expect(row.plan.side).toBe("sell")
      expect(row.plan.reduceOnly).toBe(true)
      expect(row.plan.maker).toBe(true)
      expect(row.plan.chaseGiveUp).toBe(0)
      expect(row.plan.sz).toBeCloseTo(row.marketKey === BTC ? 4 : 6, 6)
    }
    // Whatever the engine has already rested while this ran is only ever a
    // reduce-only sell. Nothing here opens anything.
    const resting = await database
      .select()
      .from(tradePaperOrders)
      .where(eq(tradePaperOrders.userId, userId))
    for (const order of resting) {
      expect(order.side).toBe("sell")
      expect(order.reduceOnly).toBe(true)
    }
  })

  it("leaves every other wallet alone", async () => {
    await open(wallet, BTC, 4)
    await open(other, ETH, 6)

    await flattenWallet(userId, wallet, words)

    const rows = await closes()
    expect(rows).toHaveLength(1)
    expect(rows[0].walletId).toBe("w1")
    expect(rows[0].marketKey).toBe(BTC)
    // The other wallet still holds what it held.
    const held = await database
      .select()
      .from(tradePaperPositions)
      .where(eq(tradePaperPositions.walletId, "w2"))
    expect(held).toHaveLength(1)
    expect(held[0].szi).toBeCloseTo(6, 6)
  })

  it("says the wallet was already empty rather than doing nothing quietly", async () => {
    const answer = await flattenWallet(userId, wallet, words)
    expect(answer).toEqual({
      stood: [],
      cancelRefused: [],
      selling: [],
      sellRefused: [],
    })
  })

  it("sells nothing when a ladder will not come off", async () => {
    await open(wallet, BTC, 4)
    standDown.refused = [
      { id: "l1", marketKey: ETH, kind: "dca", reason: "The exchange said no." },
    ]

    const answer = await flattenWallet(userId, wallet, words)
    expect(answer.cancelRefused).toHaveLength(1)
    expect(answer.cancelRefused[0].marketKey).toBe(ETH)
    expect(answer.selling).toEqual([])
    // And nothing was written to sell with: the position is untouched.
    expect(await closes()).toHaveLength(0)
    const held = await database
      .select()
      .from(tradePaperPositions)
      .where(eq(tradePaperPositions.walletId, "w1"))
    expect(held).toHaveLength(1)
    expect(held[0].szi).toBeCloseTo(4, 6)
  })

  it("reports what came off and then sells what is held", async () => {
    await open(wallet, BTC, 4)
    standDown.stood = [{ id: "l1", marketKey: ETH, kind: "dca" }]

    const answer = await flattenWallet(userId, wallet, words)
    expect(answer.stood.map((one) => one.marketKey)).toEqual([ETH])
    expect(answer.cancelRefused).toEqual([])
    expect(answer.selling).toEqual([BTC])
  })
})
