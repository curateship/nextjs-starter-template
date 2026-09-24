import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import fixture from "./apex.fixture.json"
import {
  clearApexCatalogue,
  toApexContracts,
} from "@/server/protocols/apex/catalogue"
import { apexPublic } from "@/server/protocols/apex/client"
import { apexLiveFigures } from "@/server/protocols/apex/live-prices"
import {
  fetchApexMarkets,
  toApexMarketCatalog,
  toApexTickerFigures,
} from "@/server/protocols/apex/markets"

vi.mock("@/server/protocols/apex/client", () => ({ apexPublic: vi.fn() }))
vi.mock("@/server/protocols/apex/live-prices", () => ({
  apexLiveFigures: vi.fn(),
  apexLivePricesFresh: vi.fn(() => false),
  readApexLivePrices: vi.fn(() => ({ prices: new Map() })),
}))

const publicRead = vi.mocked(apexPublic)
const liveFigures = vi.mocked(apexLiveFigures)

/** What `apexPublic` hands back: the answer's `data`, unwrapped. */
const symbols = fixture.symbols.data

beforeEach(() => {
  publicRead.mockReset()
  liveFigures.mockReset()
  clearApexCatalogue()
})

afterEach(() => {
  clearApexCatalogue()
})

describe("ApeX Omni's contracts", () => {
  it("keeps tradable perpetuals and stock contracts and never a prediction", () => {
    const contracts = toApexContracts(symbols)
    expect(contracts.map((one) => one.marketId).sort()).toEqual(
      ["BTCUSDT", "ETHUSDT", "IOUSDT", "SPCXUSDT", "SPYUSDT", "XAUUSDT"].sort()
    )
    // TON's perpetual and IWM's stock contract had trading switched off.
    expect(contracts.map((one) => one.marketId)).not.toContain("TONUSDT")
    expect(contracts.map((one) => one.marketId)).not.toContain("IWMUSDT")
    const predictions = symbols.contractConfig.predictionContract.map(
      (one) => one.crossSymbolName
    )
    for (const id of predictions) {
      expect(contracts.map((one) => one.marketId)).not.toContain(id)
    }
  })

  it("carries both spellings off the same row, and the order facts", () => {
    const btc = toApexContracts(symbols).find((one) => one.marketId === "BTCUSDT")
    expect(btc).toMatchObject({
      symbol: "BTC-USDT",
      base: "BTC",
      kind: "perpetual",
      category: "crypto",
      l2PairId: 50001,
      tickSize: 0.1,
      stepSize: 0.001,
      minOrderSize: 0.001,
      initialMarginRate: 0.01,
      canOpen: true,
    })
  })

  it("files stock contracts under stocks, indices and commodities", () => {
    const byId = new Map(toApexContracts(symbols).map((one) => [one.marketId, one]))
    expect(byId.get("SPCXUSDT")?.category).toBe("stocks")
    expect(byId.get("SPYUSDT")?.category).toBe("indices")
    expect(byId.get("XAUUSDT")?.category).toBe("commodities")
    expect(byId.get("XAUUSDT")?.kind).toBe("stock")
  })

  it("marks a market ApeX only lets positions close on", () => {
    const io = toApexContracts(symbols).find((one) => one.marketId === "IOUSDT")
    expect(io?.canOpen).toBe(false)
  })
})

describe("ApeX Omni's market rows", () => {
  it("reads a real ticker as hourly funding and dollar open interest", () => {
    const saved = fixture.tickerBtc.data[0]
    const figures = toApexTickerFigures(fixture.tickerBtc.data)
    expect(figures).toEqual({
      price: Number(saved.markPrice),
      change24h: Number(saved.price24hPcnt),
      volume24hUsd: Number(saved.turnover24h),
      // Hourly already: ApeX settles every hour, so it is not divided by 8.
      fundingHourly: Number(saved.fundingRate),
      openInterestUsd: Number(saved.openInterest) * Number(saved.markPrice),
    })
  })

  it("answers nothing for a market ApeX does not price", () => {
    expect(toApexTickerFigures(fixture.tickerUnknown.data)).toBeNull()
  })

  it("builds rows keyed by the undashed id with 100x from a 1% margin rate", () => {
    const contracts = toApexContracts(symbols)
    const figures = new Map(
      contracts.map((one) => [
        one.marketId,
        toApexTickerFigures(fixture.tickerBtc.data)!,
      ])
    )
    const catalog = toApexMarketCatalog("mainnet", contracts, figures)
    const btc = catalog.rows.find((row) => row.marketId === "BTCUSDT")
    expect(btc).toMatchObject({
      key: "apex:mainnet:BTCUSDT",
      symbol: "BTC",
      quoteAsset: "USDT",
      priceTick: 0.1,
      sizeDecimals: 3,
      minOrderSize: 0.001,
      maxLeverage: 100,
    })
    expect(catalog.protocolLabel).toBe("ApeX Omni")
    expect(catalog.picker.categories).toBe("catalog")
  })

  it("leaves out a market it has no price for rather than showing zero", () => {
    const contracts = toApexContracts(symbols)
    const catalog = toApexMarketCatalog("mainnet", contracts, new Map())
    expect(catalog.rows).toEqual([])
  })

  it("asks one ticker per market only when the price feed has nothing", async () => {
    liveFigures.mockResolvedValue(null)
    publicRead.mockImplementation(async (_network, path) => {
      if (path === "/symbols") return symbols
      return fixture.tickerBtc.data
    })
    const catalog = await fetchApexMarkets("mainnet")
    const tickers = publicRead.mock.calls.filter(([, path]) => path === "/ticker")
    expect(tickers).toHaveLength(6)
    expect(catalog.rows).toHaveLength(6)
  })

  it("reads no ticker at all when the feed is fresh", async () => {
    const figures = toApexTickerFigures(fixture.tickerBtc.data)!
    liveFigures.mockResolvedValue(
      new Map(toApexContracts(symbols).map((one) => [one.marketId, figures]))
    )
    publicRead.mockImplementation(async (_network, path) => {
      if (path === "/symbols") return symbols
      throw new Error("no ticker should be read")
    })
    const catalog = await fetchApexMarkets("mainnet")
    expect(publicRead.mock.calls.map(([, path]) => path)).toEqual(["/symbols"])
    expect(catalog.rows).toHaveLength(6)
  })
})
