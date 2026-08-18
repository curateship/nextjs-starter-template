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
/** What the exchange's feed says the wallet has money on. Null = no answer. */
const fundedMarkets = vi.hoisted(() => ({ value: null as string[] | null }))

vi.mock("@/server/protocols/hyperliquid/user-markets", () => ({
  marketsWalletHasMoneyOn: () => fundedMarkets.value,
  awaitMarketsWalletHasMoneyOn: async () => fundedMarkets.value,
}))

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
    entryLimit: null,
    baseDetection: { searchBars: 36, holdBars: 8, withTrendOnly: true, minBarsApart: 20 },
    maxPositionPct: 20,
    sizeMultiplier: 2,
    compound: true,
    leverage: 1,
    maxOrderVolPct: 0,
    twoGreen: false,
    // Inert: every ladder watches its rungs now, whatever this says. Still
    // here only because the saved-settings type carries the field.
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
  fundedMarkets.value = null

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
  it("sends nothing to the exchange when placing — every rung is watched", async () => {
    const result = await placeLiveDcaLadder(userId, wallet, {
      marketKey: MARKET,
      clickPx: 100,
      interval: "1m",
      params: params(),
    })

    expect(result).toEqual({ placed: 2, passed: 0 })
    // Not one order. A resting rung ties up real margin for a buy that may
    // never happen; the engine sends the order when price reaches the rung.
    expect(place).not.toHaveBeenCalled()
    const plan = await ladder()
    expect(plan.rungs.map((rung) => rung.status)).toEqual([
      "waiting",
      "waiting",
    ])
    expect(plan.rungs.map((rung) => rung.orderId)).toEqual([null, null])
  })

  it("ignores the borrowing setting — real money only ever spends cash", async () => {
    // The setting is a backtest instrument. It reaches the rung sizing, and
    // the orders are still sent at leverage 1, so a live ladder that read it
    // would buy three times the coin and pay the whole price out of a real
    // Hyperliquid account.
    await placeLiveDcaLadder(userId, wallet, {
      marketKey: MARKET,
      clickPx: 100,
      interval: "1m",
      params: params({ leverage: 3 }),
    })

    const plan = await ladder()
    expect(plan.leverage).toBe(1)
    // The same size a cash ladder gets, to the ninth decimal.
    expect(plan.rungs[0].sz).toBeCloseTo(0.701, 9)
  })

  it("keeps fixed sizing on the wallet's starting balance", async () => {
    account.mockResolvedValue({
      equity: 1_500,
      free: 1_500,
      inTrades: 0,
      openProfit: 0,
    })

    await placeLiveDcaLadder(userId, wallet, {
      marketKey: MARKET,
      clickPx: 100,
      interval: "1m",
      params: params({ compound: false }),
    })

    // Sized from the $1,000 the wallet started with, not the $1,500 it holds.
    expect((await ladder()).rungs[0].sz).toBeCloseTo(0.701, 9)
  })

  it("reads fills from the ladder start so a restart cannot lose an old fill", async () => {
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

  it("refuses placing on a market the wallet holds no money on", async () => {
    fundedMarkets.value = [""]
    await expect(
      placeLiveDcaLadder(userId, wallet, {
        marketKey: "hyperliquid:testnet:magm:OBOA4",
        clickPx: 100,
        interval: "1m",
        params: params(),
      })
    ).rejects.toThrow("EXCHANGE_NO_MARGIN")
    expect(
      await database.select().from(tradeSmartLadders)
    ).toHaveLength(0)
  })

  it("puts a rung back when the exchange definitely refused its buy", async () => {
    await placeLiveDcaLadder(userId, wallet, {
      marketKey: MARKET,
      clickPx: 100,
      interval: "1m",
      params: params(),
    })

    // Price crosses the first rung; the engine fires it; the exchange
    // processes the order and refuses it outright — nothing stood.
    prices.mockResolvedValue(new Map([["BTC", 94]]))
    place.mockRejectedValue(
      new Error("LIVE_ORDER_REFUSED:order 0: Insufficient margin to place order.")
    )
    await database
      .update(tradeSmartLadders)
      .set({ updatedAt: new Date(Date.now() - 3_000) })
      .where(eq(tradeSmartLadders.userId, userId))

    await reconcileLiveLadders(userId, wallet)

    const plan = await ladder()
    // Not recorded as bought with nothing behind it — which used to end the
    // ladder and let a flow place a fresh one into the same refusal, forever.
    expect(plan.rungs[0].status).toBe("waiting")
    expect(place).toHaveBeenCalled()
    const rows = await database.select().from(tradeSmartLadders)
    expect(rows[0].status).toBe("active")
  })

  it("never fires a rung on a market the wallet holds no money on", async () => {
    // A ladder that already exists on an unfunded market — placed before the
    // guard, or while the feed was cold. Without this the dip fired it, the
    // exchange refused it, the undo put it back, and the next pass fired it
    // again: one refused order a second for as long as price sat there.
    await placeLiveDcaLadder(userId, wallet, {
      marketKey: MARKET,
      clickPx: 100,
      interval: "1m",
      params: params(),
    })
    await database
      .update(tradeSmartLadders)
      .set({
        marketKey: "hyperliquid:testnet:magm:OBOA4",
        updatedAt: new Date(Date.now() - 3_000),
      })
      .where(eq(tradeSmartLadders.userId, userId))
    fundedMarkets.value = [""]
    prices.mockResolvedValue(new Map([["magm:OBOA4", 94]]))

    await reconcileLiveLadders(userId, wallet)

    expect(place).not.toHaveBeenCalled()
    expect((await ladder()).rungs[0].status).toBe("waiting")
  })

  it("does not claim an unrelated manual fill at the same price", async () => {
    await placeLiveDcaLadder(userId, wallet, {
      marketKey: MARKET,
      clickPx: 100,
      interval: "1m",
      params: params(),
    })
    const plan = await ladder()
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

    // A watched rung has no order for that fill to belong to. Somebody's
    // hand-placed buy at the same price is theirs, and the rung keeps waiting
    // for its own moment.
    expect((await ladder()).rungs[0].status).toBe("waiting")
  })
})
