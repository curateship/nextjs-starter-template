import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { DcaParams, LadderPlan } from "@/lib/trade/dca"
import type { TradeWallet } from "@/lib/trade/wallets"
import { encryptSecret } from "@/server/auth/encryption"
import { type CustomShellDb } from "@/server/db"
import { createTestDatabase, insertUser } from "@/server/test-support"
import {
  placeLiveDcaLadder,
  reconcileLiveLadders,
} from "@/server/trade/live-smart-orders"
import { clearMarketRulesCache } from "@/server/trade/market-rules"
import { tradeSmartLadders, tradeWallets } from "@/server/trade/schema"

const prices = vi.fn()
const account = vi.fn()
const portfolio = vi.fn()
const fills = vi.fn()
const place = vi.fn()
const cancel = vi.fn()
const setBrackets = vi.fn()

// Only `getProtocol` is replaced. The rest of the module comes through as
// itself, because `ordersOf` and its siblings live here too — a mock that
// listed just this one left them undefined, and every live test died on a
// call to nothing.
vi.mock("@/server/protocols/registry", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getProtocol: () => ({
    markets: {
      fetch: async () => ({
        protocol: "hyperliquid",
        protocolLabel: "Hyperliquid",
        network: "testnet",
        networkLabel: "Testnet",
        rows: [
          {
            key: "hyperliquid:testnet:BTC",
            marketId: "BTC",
            symbol: "BTC",
            subExchange: null,
            category: "crypto",
            sizeDecimals: 3,
            maxLeverage: 50,
            isolatedOnly: false,
            iconUrl: null,
            price: 100,
            change24h: null,
            volume24hUsd: 0,
            fundingHourly: null,
            openInterestUsd: null,
          },
        ],
      }),
      prices,
      candles: async () => [],
      roundPx: (px: number) => px,
    },
    account: { fetch: account },
    orders: {
      portfolio,
      fills,
      place,
      cancel,
      close: vi.fn(),
      setBrackets,
    },
  }),
}))

const MARKET = "hyperliquid:testnet:BTC"
const ADDRESS = "0x1234567890abcdef1234567890abcdef12345678"
const KEY = "ab".repeat(32)

let client: PGlite
let database: CustomShellDb
let userId: string
let wallet: TradeWallet

function params(over: Partial<DcaParams> = {}): DcaParams {
  return {
    rungs: [{ deviation: 5 }, { deviation: 8 }],
    cascade: null,
    baseDetection: { searchBars: 36, holdBars: 8, withTrendOnly: true, minBarsApart: 20 },
    maxPositionPct: 20,
    sizeMultiplier: 2,
    maxOrderVolPct: 0,
    twoGreen: false,
    // These suites are about rungs that REST on the book, which is still a
    // mode. The default is now market-on-confirmation, like the old app.
    rungEntry: "limit",
    anchor: "click",
    takeProfit: null,
    stopLoss: null,
    ...over,
  }
}

async function ladder(): Promise<LadderPlan> {
  const rows = await database
    .select()
    .from(tradeSmartLadders)
    .where(eq(tradeSmartLadders.userId, userId))
  expect(rows).toHaveLength(1)
  return rows[0].plan as LadderPlan
}

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  clearMarketRulesCache()
  process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY = "a test-only secret"
  for (const mock of [
    prices,
    account,
    portfolio,
    fills,
    place,
    cancel,
    setBrackets,
  ]) {
    mock.mockReset()
  }
  prices.mockResolvedValue(new Map([["BTC", 100]]))
  account.mockResolvedValue({
    equity: 1_000,
    free: 1_000,
    inTrades: 0,
    openProfit: 0,
  })
  portfolio.mockResolvedValue({ positions: [], orders: [] })
  fills.mockResolvedValue([])
  cancel.mockResolvedValue(undefined)
  setBrackets.mockResolvedValue(undefined)

  userId = (await insertUser(database)).id
  await database.insert(tradeWallets).values({
    userId,
    id: "live-1",
    label: "Live test",
    kind: "live",
    status: "active",
    protocol: "hyperliquid",
    network: "testnet",
    startingBalance: 1_000,
    address: ADDRESS,
    agentKeyEncrypted: encryptSecret(KEY),
  })
  wallet = {
    id: "live-1",
    label: "Live test",
    kind: "live",
    status: "active",
    protocol: "hyperliquid",
    network: "testnet",
    startingBalance: 1_000,
    address: ADDRESS,
    hasKey: true,
    keyValidUntil: null,
  }
})

afterEach(async () => {
  await client.close()
})

describe("live Smart orders", () => {
  it("places every waiting rung on the exchange and stores its exchange id", async () => {
    place
      .mockResolvedValueOnce({
        status: "resting",
        orderId: "101",
        avgPx: null,
        filledSz: null,
        protection: null,
        protectionNote: null,
      })
      .mockResolvedValueOnce({
        status: "resting",
        orderId: "102",
        avgPx: null,
        filledSz: null,
        protection: null,
        protectionNote: null,
      })

    const result = await placeLiveDcaLadder(userId, wallet, {
      marketKey: MARKET,
      clickPx: 100,
      interval: "1m",
      params: params(),
    })

    expect(result).toEqual({ placed: 2, passed: 0 })
    expect((await ladder()).rungs.map((rung) => rung.orderId)).toEqual([
      "101",
      "102",
    ])
  })

  it("rolls back accepted rungs when a later rung is refused", async () => {
    place
      .mockResolvedValueOnce({
        status: "resting",
        orderId: "101",
        avgPx: null,
        filledSz: null,
        protection: null,
        protectionNote: null,
      })
      .mockRejectedValueOnce(new Error("exchange refused"))

    await expect(
      placeLiveDcaLadder(userId, wallet, {
        marketKey: MARKET,
        clickPx: 100,
        interval: "1m",
        params: params(),
      })
    ).rejects.toThrow("exchange refused")
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(await database.select().from(tradeSmartLadders)).toHaveLength(0)
  })

  it("uses an exchange fill to advance the same rung and bracket rules", async () => {
    place
      .mockResolvedValueOnce({
        status: "resting",
        orderId: "101",
        avgPx: null,
        filledSz: null,
        protection: null,
        protectionNote: null,
      })
      .mockResolvedValueOnce({
        status: "resting",
        orderId: "102",
        avgPx: null,
        filledSz: null,
        protection: null,
        protectionNote: null,
      })
    await placeLiveDcaLadder(userId, wallet, {
      marketKey: MARKET,
      clickPx: 100,
      interval: "1m",
      params: params({
        takeProfit: { mode: "average", pct: 10 },
        stopLoss: { pct: 10, base: null },
      }),
    })

    const first = (await ladder()).rungs[0]
    portfolio.mockResolvedValue({
      positions: [
        {
          marketId: "BTC",
          szi: first.sz,
          entryPx: first.px,
          leverage: 1,
          marginUsed: first.px * first.sz,
          liquidationPx: null,
          tpPx: null,
          slPx: null,
          tpOrderId: null,
          slOrderId: null,
        },
      ],
      orders: [
        {
          orderId: "102",
          marketId: "BTC",
          side: "buy",
          px: (await ladder()).rungs[1].px,
          sz: (await ladder()).rungs[1].sz,
          reduceOnly: false,
          trigger: false,
        },
      ],
    })
    fills.mockResolvedValue([
      {
        fillId: "fill-1",
        orderId: "101",
        marketId: "BTC",
        side: "buy",
        px: first.px,
        sz: first.sz,
        at: Date.now(),
      },
    ])
    await database
      .update(tradeSmartLadders)
      .set({ updatedAt: new Date(Date.now() - 3_000) })
      .where(eq(tradeSmartLadders.userId, userId))

    await reconcileLiveLadders(userId, wallet)

    expect((await ladder()).rungs[0].status).toBe("filled")
    expect(setBrackets).toHaveBeenCalledTimes(1)
    const [, , brackets] = setBrackets.mock.calls[0]
    expect(brackets.tpPx).toBeCloseTo(first.px * 1.1)
    expect(brackets.slPx).toBeCloseTo(first.px * 0.9)
  })

  it("reads fills from the ladder start so a restart cannot lose an old fill", async () => {
    place
      .mockResolvedValueOnce({
        status: "resting",
        orderId: "101",
        avgPx: null,
        filledSz: null,
        protection: null,
        protectionNote: null,
      })
      .mockResolvedValueOnce({
        status: "resting",
        orderId: "102",
        avgPx: null,
        filledSz: null,
        protection: null,
        protectionNote: null,
      })
    await placeLiveDcaLadder(userId, wallet, {
      marketKey: MARKET,
      clickPx: 100,
      interval: "1m",
      params: params(),
    })
    const started = Date.now() - 2 * 60 * 60 * 1_000
    await database
      .update(tradeSmartLadders)
      .set({
        createdAt: new Date(started),
        updatedAt: new Date(Date.now() - 3_000),
      })
      .where(eq(tradeSmartLadders.userId, userId))

    await reconcileLiveLadders(userId, wallet)

    expect(fills.mock.calls[0][2]).toBe(started - 60_000)
  })

  it("combines partial exchange fills and keeps the amount that really bought", async () => {
    place
      .mockResolvedValueOnce({
        status: "resting",
        orderId: "101",
        avgPx: null,
        filledSz: null,
        protection: null,
        protectionNote: null,
      })
      .mockResolvedValueOnce({
        status: "resting",
        orderId: "102",
        avgPx: null,
        filledSz: null,
        protection: null,
        protectionNote: null,
      })
    await placeLiveDcaLadder(userId, wallet, {
      marketKey: MARKET,
      clickPx: 100,
      interval: "1m",
      params: params(),
    })
    const plan = await ladder()
    const first = plan.rungs[0]
    const bought = first.sz / 2
    portfolio.mockResolvedValue({
      positions: [
        {
          marketId: "BTC",
          szi: bought,
          entryPx: first.px - 1,
          leverage: 1,
          marginUsed: bought * (first.px - 1),
          liquidationPx: null,
          tpPx: null,
          slPx: null,
          tpOrderId: null,
          slOrderId: null,
        },
      ],
      orders: [
        {
          orderId: "102",
          marketId: "BTC",
          side: "buy",
          px: plan.rungs[1].px,
          sz: plan.rungs[1].sz,
          reduceOnly: false,
          trigger: false,
        },
      ],
    })
    fills.mockResolvedValue([
      {
        fillId: "fill-a",
        orderId: "101",
        marketId: "BTC",
        side: "buy",
        px: first.px - 1,
        sz: bought / 2,
        at: Date.now() - 2_000,
      },
      {
        fillId: "fill-b",
        orderId: "101",
        marketId: "BTC",
        side: "buy",
        px: first.px - 0.5,
        sz: bought / 2,
        at: Date.now() - 1_000,
      },
    ])
    await database
      .update(tradeSmartLadders)
      .set({ updatedAt: new Date(Date.now() - 3_000) })
      .where(eq(tradeSmartLadders.userId, userId))

    await reconcileLiveLadders(userId, wallet)

    const after = await ladder()
    expect(after.rungs[0].status).toBe("filled")
    expect(after.rungs[0].sz).toBeCloseTo(bought)
  })

  it("does not claim an unrelated manual fill at the same price", async () => {
    place
      .mockResolvedValueOnce({
        status: "resting",
        orderId: "101",
        avgPx: null,
        filledSz: null,
        protection: null,
        protectionNote: null,
      })
      .mockResolvedValueOnce({
        status: "resting",
        orderId: "102",
        avgPx: null,
        filledSz: null,
        protection: null,
        protectionNote: null,
      })
    await placeLiveDcaLadder(userId, wallet, {
      marketKey: MARKET,
      clickPx: 100,
      interval: "1m",
      params: params(),
    })
    const plan = await ladder()
    portfolio.mockResolvedValue({
      positions: [],
      orders: [
        {
          orderId: "102",
          marketId: "BTC",
          side: "buy",
          px: plan.rungs[1].px,
          sz: plan.rungs[1].sz,
          reduceOnly: false,
          trigger: false,
        },
      ],
    })
    fills.mockResolvedValue([
      {
        fillId: "manual-fill",
        orderId: "999",
        marketId: "BTC",
        side: "buy",
        px: plan.rungs[0].px,
        sz: plan.rungs[0].sz,
        at: Date.now(),
      },
    ])
    await database
      .update(tradeSmartLadders)
      .set({ updatedAt: new Date(Date.now() - 3_000) })
      .where(eq(tradeSmartLadders.userId, userId))

    await reconcileLiveLadders(userId, wallet)

    expect((await ladder()).rungs[0].status).toBe("skipped")
  })
})
