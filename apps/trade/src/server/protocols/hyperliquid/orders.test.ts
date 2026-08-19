import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  cappedMarketPx,
  decimalString,
  fetchHyperliquidOrderFills,
  fetchHyperliquidPortfolio,
  forgetHyperliquidPortfolios,
  setHyperliquidBrackets,
  formatPx,
  formatSize,
  orderTimeInForce,
  venueAssetId,
} from "@/server/protocols/hyperliquid/orders"
import {
  agentAddress,
  normalizeAgentKey,
} from "@/server/protocols/hyperliquid/signing"
import { assertRealOrdersAllowed } from "@/server/protocols/real-money"
import { scrubSecrets } from "@/server/protocols/scrub"

// The portfolio read is tested against fixtures, not the network.
const clearinghouseState = vi.fn()
// The two exchange calls the protection path makes, so what it would have
// sent — and the order it sends things in — can be read back.
const exchangeOrder = vi.fn()
const exchangeCancel = vi.fn()
const frontendOpenOrders = vi.fn()
const perpDexs = vi.fn()
// One call for every market's asset list, in the order perpDexs gave them.
// The per-market `meta` fan-out it replaced cost 249 requests on testnet.
const allPerpMetas = vi.fn()
const userFillsByTime = vi.fn()
/** The funding feed, controllable. Warming = just opened, nothing pushed yet. */
const feedState = vi.hoisted(
  () => ({ warming: false, moneyOn: null }) as {
    warming: boolean
    moneyOn: string[] | null
  }
)

vi.mock("@/server/protocols/hyperliquid/user-markets", () => ({
  marketsWalletUses: () => null,
  // Steerable, and null by default so the other tests keep driving venue
  // coverage through `marketsWalletUses` and the warm-up flag alone.
  marketsWalletHasMoneyOn: () => feedState.moneyOn,
  walletFeedWarmingUp: () => feedState.warming,
  dropIdleWalletFeeds: () => {},
}))

vi.mock("@nktkas/hyperliquid", () => ({
  ExchangeClient: class {
    order = exchangeOrder
    cancel = exchangeCancel
  },
  HttpTransport: class {},
}))

vi.mock("@/server/protocols/hyperliquid/client", () => ({
  infoClient: () => ({
    clearinghouseState,
    frontendOpenOrders,
    perpDexs,
    allPerpMetas,
    userFillsByTime,
  }),
}))

/** The canonical test key: private key 1, whose address is well known. */
const TEST_KEY = `0x${"0".repeat(63)}1`
const TEST_ADDRESS = "0x7e5f4552091a69125d5dfcb7b8c2659029395bdf"

describe("numbers as the wire wants them", () => {
  it("never prints an exponent", () => {
    expect(decimalString(1e-7)).toBe("0.0000001")
    expect(decimalString(0.000012345)).toBe("0.000012345")
    expect(decimalString(118205)).toBe("118205")
  })

  it("trims trailing zeros without eating whole numbers", () => {
    expect(decimalString(1.5)).toBe("1.5")
    expect(decimalString(2)).toBe("2")
  })

  it("floors sizes to the market's step — never rounds up", () => {
    expect(formatSize(0.123456, 3)).toBe("0.123")
    expect(formatSize(1.999999, 2)).toBe("1.99")
  })

  it("does not let float dust shrink an exact size", () => {
    // 0.29 is not representable exactly; a bare floor would make it 0.28.
    expect(formatSize(0.29, 2)).toBe("0.29")
  })

  it("refuses a size that floors to nothing", () => {
    expect(() => formatSize(0.004, 2)).toThrow("LIVE_SIZE")
  })

  it("prices through the exchange's own rounding", () => {
    expect(formatPx(118204.6, 0)).toBe("118205")
    // Five significant digits first (1.2346), then three decimals.
    expect(formatPx(1.23456, 3)).toBe("1.235")
  })

  it("caps a market order a few percent through the price, each side its own way", () => {
    expect(cappedMarketPx(100, "buy", 1)).toBe(103)
    expect(cappedMarketPx(100, "sell", 1)).toBe(97)
  })
})

describe("the signing rules", () => {
  beforeEach(() => {
    delete process.env.TRADE_ENABLE_MAINNET
  })
  afterEach(() => {
    delete process.env.TRADE_ENABLE_MAINNET
  })

  it("signs testnet freely and refuses mainnet until the switch is set", () => {
    expect(() => assertRealOrdersAllowed("testnet")).not.toThrow()
    expect(() => assertRealOrdersAllowed("mainnet")).toThrow("LIVE_MAINNET_OFF")
    process.env.TRADE_ENABLE_MAINNET = "true"
    expect(() => assertRealOrdersAllowed("mainnet")).not.toThrow()
  })

  it("derives the signing address from a key, with or without its 0x", () => {
    expect(agentAddress(TEST_KEY)).toBe(TEST_ADDRESS)
    expect(agentAddress(TEST_KEY.slice(2))).toBe(TEST_ADDRESS)
    expect(normalizeAgentKey(TEST_KEY.slice(2))).toBe(TEST_KEY)
  })

  it("strikes anything key-shaped out of a message, keeping addresses", () => {
    const leak = `boom ${TEST_KEY.slice(2)} at ${TEST_ADDRESS}`
    const scrubbed = scrubSecrets(leak)
    expect(scrubbed).not.toContain(TEST_KEY.slice(2))
    expect(scrubbed).toContain(TEST_ADDRESS)
    expect(scrubSecrets(`0x${"ab".repeat(32)}`)).toBe("0x…")
    expect(scrubSecrets("x".repeat(1000)).length).toBeLessThanOrEqual(301)
  })
})

describe("the asset-id rule", () => {
  it("numbers the main venue by position and hosted venues by slot", () => {
    expect(venueAssetId(0, 3)).toBe(3)
    // The SDK's own example: the first hosted venue's first asset is 110000.
    expect(venueAssetId(1, 0)).toBe(110_000)
    expect(venueAssetId(2, 7)).toBe(120_007)
  })
})

describe("order time in force", () => {
  it("makes Smart rungs post-only while preserving normal order behavior", () => {
    expect(orderTimeInForce("market")).toBe("Ioc")
    expect(orderTimeInForce("limit")).toBe("Gtc")
    expect(orderTimeInForce("postOnly")).toBe("Alo")
  })
})

describe("reading order fills", () => {
  it("keeps the exchange order id and translates its numbers", async () => {
    userFillsByTime.mockResolvedValue([
      {
        coin: "BTC",
        px: "95000.5",
        sz: "0.25",
        side: "B",
        time: 1234,
        oid: 77,
        tid: 88,
        closedPnl: "12.5",
        fee: "0.4",
        dir: "Close Short",
      },
    ])

    await expect(
      fetchHyperliquidOrderFills("testnet", TEST_ADDRESS, 1000)
    ).resolves.toEqual([
      {
        fillId: "88",
        orderId: "77",
        marketId: "BTC",
        side: "buy",
        px: 95000.5,
        sz: 0.25,
        at: 1234,
        closedPnl: 12.5,
        fee: 0.4,
        dir: "Close Short",
        liquidation: false,
      },
    ])
  })

  it("a fill missing the exchange's accounting is kept, not thrown away", async () => {
    // The testnet has been known to leave these out. A fill that vanished
    // would take a whole trade out of the Journal with it, so the honest
    // answer is the fill with zeroes in the columns nobody was told about.
    userFillsByTime.mockResolvedValue([
      { coin: "ETH", px: "3000", sz: "1", side: "A", time: 9, oid: 1, tid: 2 },
    ])

    await expect(
      fetchHyperliquidOrderFills("testnet", TEST_ADDRESS, 0)
    ).resolves.toEqual([
      {
        fillId: "2",
        orderId: "1",
        marketId: "ETH",
        side: "sell",
        px: 3000,
        sz: 1,
        at: 9,
        closedPnl: 0,
        fee: 0,
        dir: "",
        liquidation: false,
      },
    ])
  })

  it("notices when the exchange closed the position itself", async () => {
    userFillsByTime.mockResolvedValue([
      {
        coin: "BTC",
        px: "50000",
        sz: "1",
        side: "A",
        time: 5,
        oid: 3,
        tid: 4,
        liquidation: { liquidatedUser: "0xabc", markPx: "50000", method: "market" },
      },
    ])

    const fills = await fetchHyperliquidOrderFills("testnet", TEST_ADDRESS, 0)
    expect(fills[0].liquidation).toBe(true)
  })
})

describe("reading the portfolio", () => {
  beforeEach(() => {
    // The read is cached for a couple of seconds so the browser poll, the
    // ladder worker and the reconciler share one answer instead of each
    // spending its own pair of requests. Tests run inside that window and
    // would otherwise read the test before them.
    forgetHyperliquidPortfolios()
    feedState.warming = false
    clearinghouseState.mockReset()
    frontendOpenOrders.mockReset()
    perpDexs.mockReset()
    allPerpMetas.mockReset()
    // One main venue unless a test says otherwise. The venue list is cached
    // between calls inside the module, so answers must stay consistent.
    perpDexs.mockResolvedValue([null])
    allPerpMetas.mockResolvedValue([{ universe: [] }])
  })

  it("folds position-protection triggers into their position, lists the rest", async () => {
    clearinghouseState.mockResolvedValue({
      assetPositions: [
        {
          position: {
            coin: "BTC",
            szi: "0.5",
            entryPx: "100000",
            leverage: { value: 5 },
            liquidationPx: "81000",
            marginUsed: "10000",
          },
        },
      ],
    })
    frontendOpenOrders.mockResolvedValue([
      {
        coin: "BTC",
        side: "A",
        limitPx: "120000",
        sz: "0.5",
        oid: 11,
        isTrigger: true,
        triggerPx: "120000",
        isPositionTpsl: true,
        reduceOnly: true,
        orderType: "Take Profit Market",
      },
      {
        coin: "BTC",
        side: "A",
        limitPx: "90000",
        sz: "0.5",
        oid: 12,
        isTrigger: true,
        triggerPx: "90000",
        isPositionTpsl: true,
        reduceOnly: true,
        orderType: "Stop Market",
      },
      {
        coin: "ETH",
        side: "B",
        limitPx: "3000",
        sz: "2",
        oid: 13,
        isTrigger: false,
        triggerPx: "0",
        isPositionTpsl: false,
        reduceOnly: false,
        orderType: "Limit",
      },
    ])

    const portfolio = await fetchHyperliquidPortfolio("mainnet", TEST_ADDRESS)

    expect(portfolio.positions).toHaveLength(1)
    const btc = portfolio.positions[0]
    expect(btc.szi).toBe(0.5)
    expect(btc.marginUsed).toBe(10_000)
    expect(btc.liquidationPx).toBe(81_000)
    expect(btc.tpPx).toBe(120_000)
    expect(btc.tpOrderId).toBe("11")
    expect(btc.slPx).toBe(90_000)
    expect(btc.slOrderId).toBe("12")

    // The protection legs are the position's, not order rows of their own.
    expect(portfolio.orders).toHaveLength(1)
    expect(portfolio.orders[0]).toMatchObject({
      orderId: "13",
      marketId: "ETH",
      side: "buy",
      px: 3000,
      sz: 2,
      trigger: false,
    })
  })

  it("reads back how much of the position a part-sized target sells", async () => {
    clearinghouseState.mockResolvedValue({
      assetPositions: [
        {
          position: {
            coin: "BTC",
            szi: "4.25",
            entryPx: "23.5",
            leverage: { value: 1 },
            liquidationPx: null,
            marginUsed: "100",
          },
        },
      ],
    })
    frontendOpenOrders.mockResolvedValue([
      {
        coin: "BTC",
        side: "A",
        limitPx: "25.947",
        sz: "2.12",
        oid: 31,
        isTrigger: true,
        triggerPx: "25.947",
        // Half the position, filed as an ordinary reduce-only trigger — the
        // shape a part-sized target has on the exchange.
        isPositionTpsl: false,
        reduceOnly: true,
        orderType: "Take Profit Market",
      },
    ])

    const portfolio = await fetchHyperliquidPortfolio("mainnet", TEST_ADDRESS)

    const held = portfolio.positions[0]
    expect(held.tpPx).toBe(25.947)
    expect(held.tpSz).toBe(2.12)
    expect(held.tpOrderId).toBe("31")
    // Still the position's protection, not a loose order row.
    expect(portfolio.orders).toHaveLength(0)
  })

  it("folds entry-attached brackets too — reduce-only triggers without the position flag", async () => {
    clearinghouseState.mockResolvedValue({
      assetPositions: [
        {
          position: {
            coin: "BTC",
            szi: "0.5",
            entryPx: "100000",
            leverage: { value: 5 },
            liquidationPx: null,
            marginUsed: "10000",
          },
        },
      ],
    })
    frontendOpenOrders.mockResolvedValue([
      {
        coin: "BTC",
        side: "A",
        limitPx: "90000",
        sz: "0.5",
        oid: 21,
        isTrigger: true,
        triggerPx: "90000",
        isPositionTpsl: false,
        reduceOnly: true,
        orderType: "Stop Market",
      },
    ])

    const portfolio = await fetchHyperliquidPortfolio("mainnet", TEST_ADDRESS)
    expect(portfolio.positions[0].slPx).toBe(90_000)
    expect(portfolio.positions[0].slOrderId).toBe("21")
    expect(portfolio.orders).toHaveLength(0)
  })

  it("reads only the main venue while the funding feed warms up", async () => {
    // A fresh server's feed is always cold, and sweeping every venue on boot
    // was five hundred calls in the first half minute — the app rate-limited
    // itself on every restart. While the feed's first push is on its way, the
    // main venue is the whole read.
    feedState.warming = true
    perpDexs.mockResolvedValue([null, { name: "xyz" }])
    allPerpMetas.mockResolvedValue([
      { universe: [{ name: "BTC", szDecimals: 5 }] },
      { universe: [{ name: "IBM", szDecimals: 2 }] },
    ])
    clearinghouseState.mockResolvedValue({ assetPositions: [] })
    frontendOpenOrders.mockResolvedValue([])

    await fetchHyperliquidPortfolio("testnet", TEST_ADDRESS)

    expect(clearinghouseState).toHaveBeenCalledTimes(1)
    expect(clearinghouseState.mock.calls[0][0].dex).toBe("")
  })

  it("reads every venue and keeps its markets namespaced", async () => {
    // Testnet on purpose: the venue list is cached per network for a while,
    // and the mainnet tests above have already primed theirs as main-only.
    perpDexs.mockResolvedValue([null, { name: "xyz" }])
    // Aligned with perpDexs by position, which is the contract.
    allPerpMetas.mockResolvedValue([
      { universe: [{ name: "BTC", szDecimals: 5 }] },
      { universe: [{ name: "IBM", szDecimals: 2 }] },
    ])
    clearinghouseState.mockImplementation(async ({ dex }: { dex: string }) =>
      dex === "xyz"
        ? {
            assetPositions: [
              {
                position: {
                  // The venue names its coins prefixed already — the rule
                  // must not double it into "xyz:xyz:IBM".
                  coin: "xyz:IBM",
                  szi: "0.69",
                  entryPx: "224.82",
                  leverage: { value: 1 },
                  liquidationPx: null,
                  marginUsed: "155",
                },
              },
            ],
          }
        : { assetPositions: [] }
    )
    frontendOpenOrders.mockResolvedValue([])

    const portfolio = await fetchHyperliquidPortfolio(
      "testnet",
      `0x${"9".repeat(40)}`
    )
    expect(portfolio.positions).toHaveLength(1)
    expect(portfolio.positions[0].marketId).toBe("xyz:IBM")
    expect(portfolio.positions[0].marginUsed).toBe(155)
  })

  it("reads a market the wallet only has money on — a resting order is not a position", async () => {
    // The day this is for: five buys resting on xyz, nothing filled yet. No
    // position anywhere, so the positions feed says nothing — but the orders'
    // margin is money on xyz, and a market the app never reads is a market
    // whose orders never show. Placing looked broken; the reading was blind.
    feedState.moneyOn = ["xyz"]
    try {
      perpDexs.mockResolvedValue([null, { name: "xyz" }])
      allPerpMetas.mockResolvedValue([
        { universe: [{ name: "BTC", szDecimals: 5 }] },
        { universe: [{ name: "IBM", szDecimals: 2 }] },
      ])
      clearinghouseState.mockResolvedValue({ assetPositions: [] })
      frontendOpenOrders.mockImplementation(async ({ dex }: { dex: string }) =>
        dex === "xyz"
          ? [
              {
                oid: 7,
                coin: "xyz:IBM",
                side: "B",
                limitPx: "220",
                sz: "1",
                isTrigger: false,
                triggerPx: "0",
                reduceOnly: false,
                orderType: "Limit",
                isPositionTpsl: false,
              },
            ]
          : []
      )

      const portfolio = await fetchHyperliquidPortfolio(
        "testnet",
        `0x${"8".repeat(40)}`
      )
      expect(portfolio.orders.map((one) => one.marketId)).toContain("xyz:IBM")
    } finally {
      feedState.moneyOn = null
    }
  })

  it("skips flat positions and fails loudly on unreadable figures", async () => {
    clearinghouseState.mockResolvedValue({
      assetPositions: [
        {
          position: {
            coin: "SOL",
            szi: "0",
            entryPx: null,
            leverage: { value: 1 },
            liquidationPx: null,
            marginUsed: "0",
          },
        },
        {
          position: {
            coin: "BTC",
            szi: "1",
            entryPx: "junk",
            leverage: { value: 5 },
            liquidationPx: null,
            marginUsed: "10",
          },
        },
      ],
    })
    frontendOpenOrders.mockResolvedValue([])

    await expect(
      fetchHyperliquidPortfolio("mainnet", TEST_ADDRESS)
    ).rejects.toThrow("LIVE_UNREADABLE")
  })
})

describe("the protection on a real position", () => {
  const AUTH = {
    agentKey: TEST_KEY,
    allocateNonce: async () => Date.now(),
  }
  /** A position holding half a coin, with a stop and a target already on it. */
  const HELD = { szi: 0.5, tpOrderId: "11", slOrderId: "12" }

  beforeEach(() => {
    exchangeOrder.mockReset()
    exchangeCancel.mockReset()
    perpDexs.mockReset()
    allPerpMetas.mockReset()
    perpDexs.mockResolvedValue([null])
    // Matching what the asset cache already holds for testnet — it has a TTL
    // and no reset door, so this fixture has to agree with it rather than
    // quietly describing a market the code will never see.
    allPerpMetas.mockResolvedValue([
      { universe: [{ name: "BTC", szDecimals: 5 }] },
    ])
    exchangeCancel.mockResolvedValue({
      response: { data: { statuses: ["success", "success"] } },
    })
    exchangeOrder.mockResolvedValue({
      response: {
        data: { statuses: [{ resting: { oid: 21 } }, { resting: { oid: 22 } }] },
      },
    })
  })

  it("refuses a target too small to be a step BEFORE cancelling anything", async () => {
    // A millionth of a coin: nothing on a market whose smallest step is
    // 0.00001. The old legs must still be sitting there afterwards — a
    // refusal that has already cancelled them leaves real money with no stop
    // at all, which is the one outcome this path must never produce.
    await expect(
      setHyperliquidBrackets("testnet", AUTH, {
        marketId: "BTC",
        position: HELD,
        tpPx: 120_000,
        tpSz: 0.000001,
        slPx: 90_000,
      })
    ).rejects.toThrow("LIVE_SIZE")

    expect(exchangeCancel).not.toHaveBeenCalled()
    expect(exchangeOrder).not.toHaveBeenCalled()
  })

  it("sends a part-sized target as its own fixed-size leg, the stop as the position's", async () => {
    await setHyperliquidBrackets("testnet", AUTH, {
      marketId: "BTC",
      position: HELD,
      tpPx: 120_000,
      tpSz: 0.2,
      slPx: 90_000,
    })

    expect(exchangeCancel).toHaveBeenCalledTimes(1)
    // Two calls, because the exchange takes one grouping at a time. The stop
    // goes first: it is the leg that matters if the second call fails.
    expect(exchangeOrder).toHaveBeenCalledTimes(2)

    const stop = exchangeOrder.mock.calls[0][0]
    expect(stop.grouping).toBe("positionTpsl")
    expect(stop.orders).toHaveLength(1)
    expect(stop.orders[0].s).toBe("0.5")
    expect(stop.orders[0].t.trigger.tpsl).toBe("sl")

    const target = exchangeOrder.mock.calls[1][0]
    // NOT positionTpsl — the exchange grows those back to the whole position,
    // which would sell everything at the target instead of the part asked for.
    expect(target.grouping).toBe("na")
    expect(target.orders[0].s).toBe("0.2")
    expect(target.orders[0].r).toBe(true)
    expect(target.orders[0].t.trigger.tpsl).toBe("tp")
  })

  it("keeps a whole-position target on one position-scaled call", async () => {
    await setHyperliquidBrackets("testnet", AUTH, {
      marketId: "BTC",
      position: HELD,
      tpPx: 120_000,
      tpSz: null,
      slPx: 90_000,
    })

    expect(exchangeOrder).toHaveBeenCalledTimes(1)
    const both = exchangeOrder.mock.calls[0][0]
    expect(both.grouping).toBe("positionTpsl")
    expect(both.orders.map((one: { s: string }) => one.s)).toEqual(["0.5", "0.5"])
  })

  it("clears both sides by cancelling and sending nothing", async () => {
    await setHyperliquidBrackets("testnet", AUTH, {
      marketId: "BTC",
      position: HELD,
      tpPx: null,
      tpSz: null,
      slPx: null,
    })

    expect(exchangeCancel).toHaveBeenCalledTimes(1)
    expect(exchangeOrder).not.toHaveBeenCalled()
  })
})
