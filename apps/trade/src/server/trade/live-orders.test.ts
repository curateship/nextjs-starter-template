import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { type CustomShellDb } from "@/server/db"
import { encryptSecret } from "@/server/auth/encryption"
import { createTestDatabase, insertUser } from "@/server/test-support"
import {
  cancelLiveOrder,
  loadLivePortfolio,
  placeLiveOrder,
  setLiveBrackets,
} from "@/server/trade/live-orders"
import { loadLiveRefusals } from "@/server/trade/live-fills"
import { randomUUID } from "node:crypto"
import { tradeLiveJournal, tradeWallets } from "@/server/trade/schema"

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
// Only `getProtocol` is replaced. The rest of the module comes through as
// itself, because `ordersOf` and its siblings live here too — a mock that
// listed just this one left them undefined, and every live test died on a
// call to nothing.
vi.mock("@/server/protocols/registry", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getProtocol: () => ({
    label: "Hyperliquid",
    markets: {
      prices,
      fetch: async () => ({
        rows: [
          {
            marketId: "BTC",
            sizeDecimals: 3,
            priceTick: null,
            minOrderValueUsd: marketFloor,
            minOrderSize: marketMinSize,
            maxLeverage: 50,
            volume24hUsd: 1_000_000,
          },
        ],
      }),
    },
    orders: { place, cancel, close, setBrackets, portfolio },
  }),
}))

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
  portfolio.mockResolvedValue({ positions: [], orders: [] })
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
    ).rejects.toThrow("smallest order here is $10.00, and this order is $9.00")
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
    ).rejects.toThrow(
      "smallest order here is $77.00, and this order is $10.00"
    )
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
})

describe("protecting a position", () => {
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
          tpPx: null,
          tpSz: null,
          slPx: null,
          tpOrderId: null,
          slOrderId: null,
        },
      ],
      orders: [],
    })

    await setLiveBrackets(userId, {
      walletId,
      marketKey: MARKET,
      tpPx: 100_000,
      tpSz: 0.25,
      slPx: null,
    })
    expect(setBrackets).toHaveBeenCalledTimes(1)
    expect(setBrackets.mock.calls[0][2]).toMatchObject({ tpSz: 0.25 })

    // Selling the whole position is what no size already means, so it is
    // never written down as a size — the exchange leg then scales with the
    // position instead of being pinned to today's figure.
    await setLiveBrackets(userId, {
      walletId,
      marketKey: MARKET,
      tpPx: 100_000,
      tpSz: 1,
      slPx: null,
    })
    expect(setBrackets.mock.calls[1][2]).toMatchObject({ tpSz: null })

    await expect(
      setLiveBrackets(userId, {
        walletId,
        marketKey: MARKET,
        tpPx: 100_000,
        tpSz: 1.5,
        slPx: null,
      })
    ).rejects.toThrow("LIVE_TAKE_PROFIT_SIZE")
    expect(setBrackets).toHaveBeenCalledTimes(2)
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
          tpPx: null,
          slPx: null,
          tpOrderId: null,
          slOrderId: null,
        },
      ],
      orders: [],
    })

    await setLiveBrackets(userId, {
      walletId,
      marketKey: MARKET,
      tpPx: null,
      slPx: 95_000,
    })
    expect(setBrackets).toHaveBeenCalledTimes(1)

    await expect(
      setLiveBrackets(userId, {
        walletId,
        marketKey: MARKET,
        tpPx: null,
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
          tpPx: null,
          slPx: null,
          tpOrderId: null,
          slOrderId: null,
        },
      ],
      orders: [],
    })

    await setLiveBrackets(userId, {
      walletId,
      marketKey: MARKET,
      tpPx: null,
      slPx: 105_000,
    })
    expect(setBrackets).toHaveBeenCalledTimes(1)

    await expect(
      setLiveBrackets(userId, {
        walletId,
        marketKey: MARKET,
        tpPx: null,
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
