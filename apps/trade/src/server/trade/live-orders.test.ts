import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { type CustomShellDb } from "@/server/db"
import { encryptSecret } from "@/server/auth/encryption"
import { readSmartPlan } from "@/lib/trade/smart-plan"
import { snapToTick } from "@/lib/protocols/tick"
import { createTestDatabase, insertUser } from "@/server/test-support"
import {
  cancelLiveOrder,
  loadLivePortfolio,
  placeLiveOrder,
  setLiveBrackets,
} from "@/server/trade/live-orders"
import { loadLiveRefusals } from "@/server/trade/live-fills"
import { randomUUID } from "node:crypto"
import {
  tradeLiveJournal,
  tradeSmartLadders,
  tradeWallets,
} from "@/server/trade/schema"

// The exchange is a mock: these tests are about the store's rails — the
// wallet and network checks, the nonce counter, and the journal — not about
// Hyperliquid's wire format, which the adapter's own tests cover.
const prices = vi.fn()
const place = vi.fn()
const cancel = vi.fn()
const close = vi.fn()
const setBrackets = vi.fn()
const portfolio = vi.fn()
let marketFloor: number | null = null
let marketMinSize: number | null = null
let marketTick: number | null = null
// Only `getProtocol` is replaced. The rest of the module comes through as
// itself, because `ordersOf` and its siblings live here too — a mock that
// listed just this one left them undefined, and every live test died on a
// call to nothing.
vi.mock("@/server/protocols/registry", async (importOriginal) => {
  const real =
    await importOriginal<typeof import("@/server/protocols/registry")>()
  return {
  ...real,
  // The id and what the venue can do come from the REAL registry, so a test
  // about a venue that cannot place orders gets the true answer. Only the
  // market data below is invented.
  getProtocol: (id: Parameters<typeof real.getProtocol>[0]) => ({
    id,
    capabilities: real.getProtocol(id).capabilities,
    label: "Hyperliquid",
    markets: {
      prices,
      fetch: async () => ({
        rows: [
          {
            marketId: "BTC",
            sizeDecimals: 3,
            priceTick: marketTick,
            minOrderValueUsd: marketFloor,
            minOrderSize: marketMinSize,
            maxLeverage: 50,
            volume24hUsd: 1_000_000,
          },
        ],
      }),
      roundPx: (px: number, _sizeDecimals: number | null, tick: number | null) =>
        snapToTick(px, tick),
    },
    orders: { place, cancel, close, setBrackets, portfolio },
  }),
  }
})

const ADDRESS = "0x1234567890abcdef1234567890abcdef12345678"
const KEY = "ab".repeat(32)
const MARKET = "hyperliquid:mainnet:BTC"

let client: PGlite
let database: CustomShellDb

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY = "a test-only secret"
  for (const mock of [prices, place, cancel, close, setBrackets, portfolio]) {
    mock.mockReset()
  }
  prices.mockResolvedValue(new Map([["BTC", 100_000]]))
  marketFloor = null
  marketMinSize = null
  marketTick = null
  const { clearMarketRulesCache } =
    await import("@/server/trade/market-rules")
  clearMarketRulesCache()
  portfolio.mockResolvedValue({ positions: [], orders: [] })
  setBrackets.mockResolvedValue({ slOrderId: null })
  place.mockResolvedValue({
    status: "resting",
    orderId: "77",
    avgPx: null,
    filledSz: null,
    protection: null,
    protectionNote: null,
  })
})

afterEach(async () => {
  await client.close()
})

async function person() {
  return (await insertUser(database)).id
}

async function liveWallet(
  userId: string,
  overrides: Partial<typeof tradeWallets.$inferInsert> = {}
) {
  const id = crypto.randomUUID()
  await database.insert(tradeWallets).values({
    userId,
    id,
    label: "Live",
    kind: "live",
    protocol: "hyperliquid",
    network: "mainnet",
    startingBalance: 1000,
    address: ADDRESS,
    agentKeyEncrypted: encryptSecret(KEY),
    ...overrides,
  })
  return id
}

function orderInput(walletId: string) {
  return {
    walletId,
    marketKey: MARKET,
    side: "buy" as const,
    px: 90_000,
    sz: 0.5,
    leverage: 5,
    reduceOnly: false,
    tpPx: null,
    slPx: null,
  }
}

async function journalRows(userId: string) {
  return await database
    .select()
    .from(tradeLiveJournal)
    .where(eq(tradeLiveJournal.userId, userId))
}

describe("the rails around placing", () => {
  it("refuses a new order from an inactive wallet", async () => {
    const userId = await person()
    const walletId = await liveWallet(userId, { status: "inactive" })

    await expect(placeLiveOrder(userId, orderInput(walletId))).rejects.toThrow(
      "WALLET_INACTIVE"
    )
    expect(place).not.toHaveBeenCalled()
  })

  it("refuses a practice wallet — only a live wallet trades this way", async () => {
    const userId = await person()
    const walletId = await liveWallet(userId, {
      kind: "paper",
      address: null,
      agentKeyEncrypted: null,
    })
    await expect(placeLiveOrder(userId, orderInput(walletId))).rejects.toThrow(
      "LIVE_WALLET_KIND"
    )
  })

  it("refuses a market on the other network, and writes the refusal down", async () => {
    const userId = await person()
    const walletId = await liveWallet(userId, { network: "testnet" })

    await expect(placeLiveOrder(userId, orderInput(walletId))).rejects.toThrow(
      "LIVE_NETWORK_MISMATCH"
    )
    const rows = await journalRows(userId)
    expect(rows).toHaveLength(1)
    expect(rows[0].action).toBe("refused")
    expect(rows[0].note).toContain("LIVE_NETWORK_MISMATCH")
    // Nothing was signed and nothing was sent.
    expect(place).not.toHaveBeenCalled()
  })

  it("trades a sub-exchange market like any other — the venues are all read now", async () => {
    const userId = await person()
    const walletId = await liveWallet(userId)
    prices.mockResolvedValue(new Map([["xyz:AAPL", 200]]))

    await placeLiveOrder(userId, {
      ...orderInput(walletId),
      marketKey: "hyperliquid:mainnet:xyz:AAPL",
      px: 190,
    })
    const [, , params] = place.mock.calls[0]
    expect(params.marketId).toBe("xyz:AAPL")
  })

  it("refuses protection on the wrong side before anything is signed", async () => {
    const userId = await person()
    const walletId = await liveWallet(userId)
    await expect(
      placeLiveOrder(userId, {
        ...orderInput(walletId),
        // A take profit below where a buy fills is not a take profit.
        tpPx: 80_000,
      })
    ).rejects.toThrow("LIVE_TAKE_PROFIT_SIDE")
    expect(place).not.toHaveBeenCalled()
  })

  it("places a below-the-price buy as a waiting limit and journals it", async () => {
    const userId = await person()
    const walletId = await liveWallet(userId)

    const outcome = await placeLiveOrder(userId, orderInput(walletId))
    expect(outcome.status).toBe("resting")

    expect(place).toHaveBeenCalledTimes(1)
    const [network, auth, params] = place.mock.calls[0]
    expect(network).toBe("mainnet")
    expect(params).toMatchObject({
      marketId: "BTC",
      kind: "limit",
      px: 90_000,
      leverage: 5,
      marginMode: null,
    })

    // The nonce counter: strictly rising, one database row per signer.
    const first = await auth.allocateNonce("0xagent")
    const second = await auth.allocateNonce("0xagent")
    expect(second).toBeGreaterThan(first)

    const rows = await journalRows(userId)
    expect(rows).toHaveLength(1)
    expect(rows[0].action).toBe("placed")
    expect(rows[0].sz).toBe(0.5)
  })

  it("uses the Aster wallet's saved margin mode for a fresh position", async () => {
    const userId = await person()
    const walletId = await liveWallet(userId, {
      protocol: "aster",
      asterMarginMode: "cross",
    })
    prices.mockResolvedValue(new Map([["BTCUSDT", 100_000]]))

    await placeLiveOrder(userId, {
      ...orderInput(walletId),
      marketKey: "aster:mainnet:BTCUSDT",
    })

    expect(place.mock.calls[0]?.[2].marginMode).toBe("cross")
  })

  it("refuses an order below the venue's dollar floor before sending it", async () => {
    const userId = await person()
    const walletId = await liveWallet(userId)
    marketFloor = 10
    const { clearMarketRulesCache } =
      await import("@/server/trade/market-rules")
    clearMarketRulesCache()

    await expect(
      placeLiveOrder(userId, { ...orderInput(walletId), px: 9, sz: 1 })
    ).rejects.toThrow("smallest order here is $10.01, and this order is $9.00")
    expect(place).not.toHaveBeenCalled()
  })

  it("refuses a size below the venue's coin minimum before sending it", async () => {
    const userId = await person()
    const walletId = await liveWallet(userId)
    marketFloor = 5
    marketMinSize = 0.001
    const { clearMarketRulesCache } =
      await import("@/server/trade/market-rules")
    clearMarketRulesCache()

    await expect(
      placeLiveOrder(userId, {
        ...orderInput(walletId),
        px: 77_000,
        sz: 10 / 77_000,
      })
    ).rejects.toThrow("smallest order here is $77.00, and this order is $0.00")
    expect(place).not.toHaveBeenCalled()
  })

  it("uses a post-only order when a Smart rung must stay resting", async () => {
    const userId = await person()
    const walletId = await liveWallet(userId)

    await placeLiveOrder(userId, {
      ...orderInput(walletId),
      restingOnly: true,
    })

    const [, , params] = place.mock.calls[0]
    expect(params.kind).toBe("postOnly")
  })

  it("refuses a Smart rung that already crossed the market", async () => {
    const userId = await person()
    const walletId = await liveWallet(userId)

    await expect(
      placeLiveOrder(userId, {
        ...orderInput(walletId),
        px: 110_000,
        restingOnly: true,
      })
    ).rejects.toThrow("LIVE_SMART_ORDER_NOT_RESTING")
    expect(place).not.toHaveBeenCalled()
  })

  it("sends a click through the price as a capped market order at the mark", async () => {
    const userId = await person()
    const walletId = await liveWallet(userId)

    await placeLiveOrder(userId, { ...orderInput(walletId), px: 110_000 })
    const [, , params] = place.mock.calls[0]
    expect(params.kind).toBe("market")
    expect(params.px).toBe(100_000)
  })

  it("lets an existing position keep its own leverage", async () => {
    const userId = await person()
    const walletId = await liveWallet(userId)
    portfolio.mockResolvedValue({
      positions: [
        {
          marketId: "BTC",
          szi: 1,
          entryPx: 95_000,
          leverage: 3,
          marginUsed: 30_000,
          liquidationPx: null,
          tpPx: null,
          slPx: null,
          tpOrderId: null,
          slOrderId: null,
          protectionOrderIds: [],
        },
      ],
      orders: [],
    })

    await placeLiveOrder(userId, orderInput(walletId))
    const [, , params] = place.mock.calls[0]
    expect(params.leverage).toBeNull()
  })

  it("never hands the key to anything but the adapter, and never stores it plain", async () => {
    const userId = await person()
    const walletId = await liveWallet(userId)

    await placeLiveOrder(userId, orderInput(walletId))
    const [, auth] = place.mock.calls[0]
    // The adapter got the real key — decrypted for this one call…
    expect(auth.agentKey).toBe(KEY)
    // …and the journal this action wrote carries no trace of it.
    const rows = await journalRows(userId)
    expect(JSON.stringify(rows)).not.toContain(KEY)
  })
})

describe("cancelling", () => {
  it("sends the known order id without waiting for another portfolio read", async () => {
    const userId = await person()
    const walletId = await liveWallet(userId)
    cancel.mockResolvedValue(undefined)

    await cancelLiveOrder(userId, {
      walletId,
      marketKey: MARKET,
      orderId: "404",
    })

    expect(portfolio).not.toHaveBeenCalled()
    expect(cancel).toHaveBeenCalledWith("mainnet", expect.any(Object), {
      marketId: "BTC",
      orderId: "404",
    })
  })

  it("journals a cancel accepted by the exchange", async () => {
    const userId = await person()
    const walletId = await liveWallet(userId)
    cancel.mockResolvedValue(undefined)

    await cancelLiveOrder(userId, {
      walletId,
      marketKey: MARKET,
      orderId: "77",
      side: "sell",
      px: 120_000,
      sz: 0.25,
    })
    const rows = await journalRows(userId)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      action: "cancelled",
      side: "sell",
      px: 120_000,
      sz: 0.25,
    })
  })

  it("reports the refusal and rejects when the exchange refuses the cancel", async () => {
    const userId = await person()
    const walletId = await liveWallet(userId)
    cancel.mockRejectedValue(new Error("exchange busy"))

    await expect(
      cancelLiveOrder(userId, {
        walletId,
        marketKey: MARKET,
        orderId: "88",
      })
    ).rejects.toThrow("exchange busy")

    const rows = await journalRows(userId)
    expect(rows).toHaveLength(1)
    expect(rows[0].action).toBe("refused")
  })
})

describe("protecting a position", () => {
  it("rounds targets and stops to the market's price tick before sending them", async () => {
    const userId = await person()
    const walletId = await liveWallet(userId)
    marketTick = 0.00001
    const { clearMarketRulesCache } =
      await import("@/server/trade/market-rules")
    clearMarketRulesCache()
    prices.mockResolvedValue(new Map([["BTC", 0.02]]))
    portfolio.mockResolvedValue({
      positions: [
        {
          marketId: "BTC",
          szi: 1,
          entryPx: 0.018,
          leverage: 5,
          marginUsed: 0.018,
          liquidationPx: null,
          targets: [],
          tpPx: null,
          tpSz: null,
          slPx: null,
          tpOrderId: null,
          slOrderId: null,
          protectionOrderIds: ["old-protection"],
        },
      ],
      orders: [],
    })

    await setLiveBrackets(userId, {
      walletId,
      marketKey: MARKET,
      targets: [{ px: 0.04111155774292908, sz: null }],
      slPx: 0.019131285692003695,
    })

    expect(setBrackets.mock.calls[0][2]).toMatchObject({
      targets: [{ px: 0.04111, sz: null }],
      slPx: 0.01913,
    })
  })

  it("passes a part-sized target through, and refuses one bigger than the position", async () => {
    const userId = await person()
    const walletId = await liveWallet(userId)
    portfolio.mockResolvedValue({
      positions: [
        {
          marketId: "BTC",
          szi: 1,
          entryPx: 90_000,
          leverage: 5,
          marginUsed: 18_000,
          liquidationPx: null,
          targets: [],
          tpPx: null,
          tpSz: null,
          slPx: null,
          tpOrderId: null,
          slOrderId: null,
          protectionOrderIds: [],
        },
      ],
      orders: [],
    })

    await setLiveBrackets(userId, {
      walletId,
      marketKey: MARKET,
      targets: [
        { px: 100_000, sz: 0.25 },
        { px: 110_000, sz: 0.25 },
        { px: 120_000, sz: 0.5 },
      ],
      slPx: null,
    })
    expect(setBrackets).toHaveBeenCalledTimes(1)
    expect(setBrackets.mock.calls[0][2]).toMatchObject({
      targets: [
        { px: 100_000, sz: 0.25 },
        { px: 110_000, sz: 0.25 },
        { px: 120_000, sz: 0.5 },
      ],
    })

    await expect(
      setLiveBrackets(userId, {
        walletId,
        marketKey: MARKET,
        targets: [
          { px: 100_000, sz: 0.6 },
          { px: 110_000, sz: 0.6 },
        ],
        slPx: null,
      })
    ).rejects.toThrow("LIVE_TAKE_PROFIT_TOTAL")
    expect(setBrackets).toHaveBeenCalledTimes(1)
  })

  it("writes a bracket replacement refusal in plain words", async () => {
    const userId = await person()
    const walletId = await liveWallet(userId)
    portfolio.mockResolvedValue({
      positions: [
        {
          marketId: "BTC",
          szi: 1,
          entryPx: 90_000,
          leverage: 5,
          marginUsed: 18_000,
          liquidationPx: null,
          targets: [],
          tpPx: null,
          tpSz: null,
          slPx: null,
          tpOrderId: null,
          slOrderId: null,
          protectionOrderIds: [],
        },
      ],
      orders: [],
    })
    setBrackets.mockRejectedValue(
      new Error(
        "LIVE_BRACKET_REPLACE_PARTIAL:The old protection is still on. The new stop also went on."
      )
    )

    await expect(
      setLiveBrackets(userId, {
        walletId,
        marketKey: MARKET,
        targets: [{ px: 110_000, sz: null }],
        slPx: null,
      })
    ).rejects.toThrow("LIVE_BRACKET_REPLACE_PARTIAL")

    const [row] = await journalRows(userId)
    expect(row.note).toBe(
      "The old protection is still on. The new stop also went on."
    )
  })

  it("sizes the stop the way a target is sized", async () => {
    const userId = await person()
    const walletId = await liveWallet(userId)
    portfolio.mockResolvedValue({
      positions: [
        {
          marketId: "BTC",
          szi: 1,
          entryPx: 90_000,
          leverage: 5,
          marginUsed: 18_000,
          liquidationPx: null,
          targets: [],
          tpPx: null,
          tpSz: null,
          slPx: null,
          tpOrderId: null,
          slOrderId: null,
          protectionOrderIds: [],
        },
      ],
      orders: [],
    })

    // Bigger than the position: refused before the exchange hears about it.
    await expect(
      setLiveBrackets(userId, {
        walletId,
        marketKey: MARKET,
        targets: [],
        slPx: 80_000,
        slSz: 1.5,
      })
    ).rejects.toThrow("LIVE_STOP_TOTAL")
    expect(setBrackets).not.toHaveBeenCalled()

    // A part of the position travels through as given.
    await setLiveBrackets(userId, {
      walletId,
      marketKey: MARKET,
      targets: [],
      slPx: 80_000,
      slSz: 0.4,
    })
    expect(setBrackets.mock.calls[0][2]).toMatchObject({
      slPx: 80_000,
      slSz: 0.4,
    })

    // Exactly the whole position collapses back to the growing stop.
    await setLiveBrackets(userId, {
      walletId,
      marketKey: MARKET,
      targets: [],
      slPx: 80_000,
      slSz: 1,
    })
    expect(setBrackets.mock.calls[1][2]).toMatchObject({
      slPx: 80_000,
      slSz: null,
    })

    // Unless the caller owns its stop and named the order it replaces: a
    // paired grid can hold the entire position while the ladder waits, and
    // a collapse then would stretch its stop over the ladder's later rungs.
    await setLiveBrackets(userId, {
      walletId,
      marketKey: MARKET,
      targets: [],
      slPx: 80_000,
      slSz: 1,
      replaceOrderIds: [],
    })
    expect(setBrackets.mock.calls[2][2]).toMatchObject({
      slPx: 80_000,
      slSz: 1,
    })
  })

  it("spares a paired grid's own stop, and replaces only what a caller names", async () => {
    const userId = await person()
    const walletId = await liveWallet(userId)
    const level = (buyPx: number) => ({
      buyPx,
      sellPx: buyPx + 1_000,
      sz: 0.2,
      budget: buyPx * 0.2,
      heldSz: 0.2,
      status: "holding",
      armed: true,
      dead: false,
      cycles: 0,
    })
    // Through the real reader, so the fixture is a plan the app would
    // actually accept — a hand-typed shape the schema refuses would make
    // the sparing quietly not happen and the test pass for the wrong
    // reason.
    const plan = readSmartPlan("grid", {
      topPx: 100_000,
      bottomPx: 95_000,
      potPct: 20,
      startedAt: 1,
      sizeDecimals: 3,
      maxLeverage: 20,
      levels: [level(95_000), level(96_000)],
      stopLoss: { mode: "fixed", underPct: 5, px: 92_000, base: null },
      aimedSlPx: null,
      pairedStop: { orderId: "7", px: 92_000, sz: 0.4, placedAt: 1 },
    })
    if (!plan) throw new Error("the test's grid plan did not parse")
    await database.insert(tradeSmartLadders).values({
      userId,
      id: crypto.randomUUID(),
      walletId,
      marketKey: MARKET,
      kind: "grid",
      status: "active",
      plan,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    portfolio.mockResolvedValue({
      positions: [
        {
          marketId: "BTC",
          szi: 1,
          entryPx: 90_000,
          leverage: 5,
          marginUsed: 18_000,
          liquidationPx: null,
          targets: [],
          tpPx: null,
          tpSz: null,
          slPx: 92_000,
          tpOrderId: null,
          slOrderId: "7",
          protectionOrderIds: ["7", "8"],
        },
      ],
      orders: [],
    })

    // An ordinary replace — a hand dragging the position's stop — cancels
    // every leg EXCEPT the grid's own.
    await setLiveBrackets(userId, {
      walletId,
      marketKey: MARKET,
      targets: [],
      slPx: 85_000,
    })
    expect(setBrackets.mock.calls[0][2].position.protectionOrderIds).toEqual([
      "8",
    ])

    // The grid replacing its own stop names exactly its old order, and the
    // new order's id comes back so the grid can keep hold of it.
    setBrackets.mockResolvedValue({ slOrderId: "99" })
    const placed = await setLiveBrackets(userId, {
      walletId,
      marketKey: MARKET,
      targets: [],
      slPx: 91_000,
      slSz: 0.4,
      replaceOrderIds: ["7"],
    })
    expect(setBrackets.mock.calls[1][2].position.protectionOrderIds).toEqual([
      "7",
    ])
    expect(setBrackets.mock.calls[1][2]).toMatchObject({ slSz: 0.4 })
    expect(placed.slOrderId).toBe("99")
  })

  it("lets a long trail its stop above entry but not beyond the current price", async () => {
    const userId = await person()
    const walletId = await liveWallet(userId)
    portfolio.mockResolvedValue({
      positions: [
        {
          marketId: "BTC",
          szi: 1,
          entryPx: 90_000,
          leverage: 5,
          marginUsed: 18_000,
          liquidationPx: null,
          targets: [],
          tpPx: null,
          slPx: null,
          tpOrderId: null,
          slOrderId: null,
          protectionOrderIds: [],
        },
      ],
      orders: [],
    })

    await setLiveBrackets(userId, {
      walletId,
      marketKey: MARKET,
      targets: [],
      slPx: 95_000,
    })
    expect(setBrackets).toHaveBeenCalledTimes(1)

    await expect(
      setLiveBrackets(userId, {
        walletId,
        marketKey: MARKET,
        targets: [],
        slPx: 101_000,
      })
    ).rejects.toThrow("LIVE_STOP_SIDE")
    expect(setBrackets).toHaveBeenCalledTimes(1)
  })

  it("lets a short trail its stop below entry but not beyond the current price", async () => {
    const userId = await person()
    const walletId = await liveWallet(userId)
    portfolio.mockResolvedValue({
      positions: [
        {
          marketId: "BTC",
          szi: -1,
          entryPx: 110_000,
          leverage: 5,
          marginUsed: 22_000,
          liquidationPx: null,
          targets: [],
          tpPx: null,
          slPx: null,
          tpOrderId: null,
          slOrderId: null,
          protectionOrderIds: [],
        },
      ],
      orders: [],
    })

    await setLiveBrackets(userId, {
      walletId,
      marketKey: MARKET,
      targets: [],
      slPx: 105_000,
    })
    expect(setBrackets).toHaveBeenCalledTimes(1)

    await expect(
      setLiveBrackets(userId, {
        walletId,
        marketKey: MARKET,
        targets: [],
        slPx: 99_000,
      })
    ).rejects.toThrow("LIVE_STOP_SIDE")
    expect(setBrackets).toHaveBeenCalledTimes(1)
  })
})

describe("the portfolio read", () => {
  it("maps every live wallet's rows and names the unreachable ones", async () => {
    const userId = await person()
    const walletId = await liveWallet(userId)
    const deadId = await liveWallet(userId, { label: "Dead" })
    const inactiveId = await liveWallet(userId, {
      label: "Off",
      status: "inactive",
    })

    portfolio.mockImplementation(async (_network: string, address: string) => {
      void address
      if (portfolio.mock.calls.length > 1) throw new Error("down")
      return {
        positions: [
          {
            marketId: "BTC",
            szi: 0.5,
            entryPx: 100_000,
            leverage: 5,
            marginUsed: 10_000,
            liquidationPx: 81_000,
            tpPx: null,
            slPx: null,
            tpOrderId: null,
            slOrderId: null,
          },
        ],
        orders: [],
      }
    })

    const wallets = [
      {
        id: walletId,
        label: "Live",
        kind: "live" as const,
        status: "active" as const,
        protocol: "hyperliquid" as const,
        network: "mainnet" as const,
        startingBalance: 1000,
        address: ADDRESS,
        hasKey: true,
        keyValidUntil: null,
      },
      {
        id: deadId,
        label: "Dead",
        kind: "live" as const,
        status: "active" as const,
        protocol: "hyperliquid" as const,
        network: "mainnet" as const,
        startingBalance: 1000,
        address: ADDRESS,
        hasKey: true,
        keyValidUntil: null,
      },
      {
        id: inactiveId,
        label: "Off",
        kind: "live" as const,
        status: "inactive" as const,
        protocol: "hyperliquid" as const,
        network: "mainnet" as const,
        startingBalance: 1000,
        address: ADDRESS,
        hasKey: true,
        keyValidUntil: null,
      },
    ]
    const answer = await loadLivePortfolio(userId, wallets)

    expect(answer.positions).toHaveLength(1)
    expect(answer.positions[0].live?.marginUsed).toBe(10_000)
    expect(answer.unreachable).toHaveLength(1)
    expect(portfolio).toHaveBeenCalledTimes(2)
  })
})

describe("reading refusals back", () => {
  /**
   * The record was written and read by nothing for months, on the reasoning
   * that a person could go digging when an order had gone wrong. Digging
   * needs a database client, so in practice the answer was invisible: a
   * Phemex level refused twenty times in eighteen minutes still drew as
   * "waiting" with nothing on screen saying why.
   */
  async function refusal(
    userId: string,
    walletId: string,
    marketKey: string,
    note: string | null,
    at: Date
  ) {
    await database.insert(tradeLiveJournal).values({
      userId,
      walletId,
      id: randomUUID(),
      marketKey,
      action: "refused",
      side: "buy",
      px: 0,
      sz: 0,
      note,
      createdAt: at,
    })
  }

  it("keeps only the newest refusal on each market", async () => {
    // A full market refuses every retry, so twenty identical rows are one
    // fact. Twenty lines on screen would bury every other market.
    const userId = await person()
    const walletId = await liveWallet(userId)
    const now = Date.now()
    await refusal(userId, walletId, MARKET, "older", new Date(now - 120_000))
    await refusal(userId, walletId, MARKET, "newest", new Date(now - 5_000))
    await refusal(
      userId,
      walletId,
      "hyperliquid:mainnet:ETH",
      "a different market",
      new Date(now - 60_000)
    )

    const rows = await loadLiveRefusals(userId, [walletId])

    expect(rows).toHaveLength(2)
    expect(rows.find((one) => one.marketKey === MARKET)?.note).toBe("newest")
    expect(
      rows.find((one) => one.marketKey === "hyperliquid:mainnet:ETH")?.note
    ).toBe("a different market")
  })

  it("keeps the same market separate in two wallets", async () => {
    const userId = await person()
    const firstWallet = await liveWallet(userId)
    const secondWallet = await liveWallet(userId)
    const now = new Date()
    await refusal(userId, firstWallet, MARKET, "first wallet", now)
    await refusal(userId, secondWallet, MARKET, "second wallet", now)

    const rows = await loadLiveRefusals(userId, [firstWallet, secondWallet])

    expect(rows).toHaveLength(2)
    expect(rows.map((row) => row.walletId).sort()).toEqual(
      [firstWallet, secondWallet].sort()
    )
  })

  it("forgets a refusal older than the window", async () => {
    // A market refused this morning and quietly working since is not news.
    // The question this answers is why nothing is happening right now.
    const userId = await person()
    const walletId = await liveWallet(userId)
    await refusal(
      userId,
      walletId,
      MARKET,
      "yesterday",
      new Date(Date.now() - 7 * 60 * 60_000)
    )

    expect(await loadLiveRefusals(userId, [walletId])).toEqual([])
  })

  it("skips a refusal with nothing written on it", async () => {
    // An empty line under a level reads as a fault of its own.
    const userId = await person()
    const walletId = await liveWallet(userId)
    await refusal(userId, walletId, MARKET, null, new Date())

    expect(await loadLiveRefusals(userId, [walletId])).toEqual([])
  })

  it("strikes out anything key-shaped before it can be drawn", async () => {
    // These rows only ever sat in a table nobody read. Now they are drawn on
    // a page and put in a tooltip, and `refuse()` journals whatever an error
    // happened to say — an unexpected exception carries whatever was in scope
    // when it was thrown.
    const userId = await person()
    const walletId = await liveWallet(userId)
    await refusal(
      userId,
      walletId,
      MARKET,
      `The exchange refused: key=${"a".repeat(64)}`,
      new Date()
    )

    const [row] = await loadLiveRefusals(userId, [walletId])

    expect(row.note).not.toContain("a".repeat(64))
    expect(row.note).toContain("The exchange refused")
  })

  it("never reaches another person's wallet", async () => {
    const mine = await person()
    const myWallet = await liveWallet(mine)
    const theirs = await person()
    const theirWallet = await liveWallet(theirs)
    await refusal(theirs, theirWallet, MARKET, "not yours", new Date())

    expect(await loadLiveRefusals(mine, [myWallet])).toEqual([])
  })
})

describe("the guarded market fire — a watched click already at its price", () => {
  it("fires at market while the fresh quote is still at the level", async () => {
    const userId = await person()
    const walletId = await liveWallet(userId)
    place.mockResolvedValue({
      status: "filled",
      orderId: null,
      avgPx: 100_000,
      filledSz: 0.5,
      protection: null,
      protectionNote: null,
    })

    const outcome = await placeLiveOrder(userId, {
      ...orderInput(walletId),
      px: 101_000,
      marketOnly: true,
      marketGuardPx: 101_000,
    })

    expect(outcome.status).toBe("filled")
    expect(place).toHaveBeenCalledOnce()
    expect(place.mock.calls[0][2]).toMatchObject({
      kind: "market",
      px: 100_000,
    })
  })

  it("refuses the fire when the quote left the level, placing nothing", async () => {
    const userId = await person()
    const walletId = await liveWallet(userId)

    await expect(
      placeLiveOrder(userId, {
        ...orderInput(walletId),
        px: 99_000,
        marketOnly: true,
        marketGuardPx: 99_000,
      })
    ).rejects.toThrow("LIVE_SMART_ORDER_PRICE_MOVED")

    expect(place).not.toHaveBeenCalled()
    // This refusal is the caller's cue to fall back to the watch row, not a
    // failure to record — the journal stays clean.
    expect(await journalRows(userId)).toEqual([])
  })
})
