import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  cappedMarketPx,
  decimalString,
  fetchHyperliquidPortfolio,
  formatPx,
  formatSize,
  venueAssetId,
} from "@/server/protocols/hyperliquid/orders"
import {
  assertRealOrdersAllowed,
  agentAddress,
  normalizeAgentKey,
  scrubSecrets,
} from "@/server/protocols/hyperliquid/signing"

// The portfolio read is tested against fixtures, not the network.
const clearinghouseState = vi.fn()
const frontendOpenOrders = vi.fn()
const perpDexs = vi.fn()
const meta = vi.fn()
vi.mock("@/server/protocols/hyperliquid/client", () => ({
  infoClient: () => ({ clearinghouseState, frontendOpenOrders, perpDexs, meta }),
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

describe("reading the portfolio", () => {
  beforeEach(() => {
    clearinghouseState.mockReset()
    frontendOpenOrders.mockReset()
    perpDexs.mockReset()
    meta.mockReset()
    // One main venue unless a test says otherwise. The venue list is cached
    // between calls inside the module, so answers must stay consistent.
    perpDexs.mockResolvedValue([null])
    meta.mockResolvedValue({ universe: [] })
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

  it("reads every venue and keeps its markets namespaced", async () => {
    // Testnet on purpose: the venue list is cached per network for a while,
    // and the mainnet tests above have already primed theirs as main-only.
    perpDexs.mockResolvedValue([null, { name: "xyz" }])
    meta.mockImplementation(async ({ dex }: { dex: string }) =>
      dex === "xyz"
        ? { universe: [{ name: "IBM", szDecimals: 2 }] }
        : { universe: [{ name: "BTC", szDecimals: 5 }] }
    )
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
