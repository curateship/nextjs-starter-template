import { describe, expect, it } from "vitest"

import saved from "./edgex.fixture.json"
import { historySourceFor } from "@/lib/protocols/history-source"
import { toEdgexBars } from "@/server/protocols/edgex/candles"
import { toEdgexCatalogue } from "@/server/protocols/edgex/catalogue"
import { toEdgexFundingRates } from "@/server/protocols/edgex/funding"
import { applyEdgexFrame } from "@/server/protocols/edgex/live-prices"
import { toEdgexMarketCatalog, toEdgexTickerPrice } from "@/server/protocols/edgex/markets"

/**
 * Every answer here is a real one, read from edgeX's v2 host on
 * 24 Sep 2026 and trimmed to seven contracts: BTC, SPY, Samsung (a stock
 * whose exchange was shut when read), gold, 1000PEPE, the USD/JPY currency
 * contract and the hidden JPY one.
 */
const catalogue = toEdgexCatalogue(saved.metadata)

function figuresOf(frame: unknown) {
  const state = {
    figures: new Map(),
    prices: new Map<string, number>(),
    open: new Map<string, boolean>(),
    fundingHours: new Map(catalogue.contracts.map((one) => [one.marketId, one.fundingHours])),
  }
  const replies: object[] = []
  const saw = applyEdgexFrame(state, frame, (reply) => replies.push(reply))
  return { state, replies, saw }
}

describe("edgeX's market list", () => {
  it("reads every contract with its two ids, steps and leverage", () => {
    expect(catalogue.contracts).toHaveLength(7)
    const btc = catalogue.contracts.find((one) => one.marketId === "BTCUSDC")
    expect(btc).toMatchObject({
      contractId: "30000001",
      base: "BTC",
      category: "crypto",
      tickSize: 0.1,
      stepSize: 0.001,
      minOrderSize: 0.001,
      maxLeverage: 100,
      defaultLeverage: 10,
      takerFeeRate: "0.00045",
      makerFeeRate: "0.0004",
      fundingHours: 4,
      listed: true,
    })
  })

  it("files stocks, metals and currencies apart from coins", () => {
    const category = (name: string) =>
      catalogue.contracts.find((one) => one.marketId === name)?.category
    expect(category("SPYUSDC")).toBe("stocks")
    expect(category("SAMSUNGUSDC")).toBe("stocks")
    expect(category("XAUUSDC")).toBe("commodities")
    expect(category("USDJPYUSDC")).toBe("forex")
    expect(category("1000PEPEUSDC")).toBe("crypto")
  })

  it("draws a row per listed contract from the pushed figures, leaving out the hidden one", () => {
    const { state } = figuresOf(saved.tickerAll)
    const list = toEdgexMarketCatalog("mainnet", catalogue.contracts, state.figures)
    const names = list.rows.map((row) => row.marketId).sort()
    expect(names).not.toContain("JPYUSDC")
    expect(names).toContain("BTCUSDC")
    const btc = list.rows.find((row) => row.marketId === "BTCUSDC")!
    const pushed = saved.tickerAll.content.data.find((row) => row.contractName === "BTCUSDC")!
    expect(btc.key).toBe("edgex:mainnet:BTCUSDC")
    expect(btc.symbol).toBe("BTC")
    expect(btc.quoteAsset).toBe("USDC")
    expect(btc.price).toBe(Number(pushed.markPrice))
    expect(btc.change24h).toBe(Number(pushed.priceChangePercent))
    expect(btc.volume24hUsd).toBe(Number(pushed.value))
    // edgeX's rate is per four-hour settlement; the list shows it hourly.
    expect(btc.fundingHourly).toBeCloseTo(Number(pushed.fundingRate) / 4, 12)
    expect(btc.openInterestUsd).toBeCloseTo(
      Number(pushed.openInterest) * Number(pushed.markPrice),
      6
    )
    expect(btc.sizeDecimals).toBe(3)
    expect(btc.priceTick).toBe(0.1)
    expect(btc.maxLeverage).toBe(100)
  })

  it("reads a single contract's price for a market the feed has not priced", () => {
    expect(toEdgexTickerPrice(saved.tickerSamsung)).toBe(
      Number(saved.tickerSamsung[0].markPrice)
    )
    expect(toEdgexTickerPrice([])).toBeNull()
  })

  it("borrows stock and metal history from Dukascopy and coins from Binance", () => {
    expect(historySourceFor("edgex:mainnet:BTCUSDC")).toBe("binance:mainnet:BTC")
    expect(historySourceFor("edgex:mainnet:1000PEPEUSDC")).toBe("binance:mainnet:kPEPE")
    expect(historySourceFor("edgex:mainnet:SPYUSDC")).toMatch(/^dukascopy:mainnet:/)
    expect(historySourceFor("edgex:mainnet:XAUUSDC")).toMatch(/^dukascopy:mainnet:/)
  })
})

describe("edgeX's price feed", () => {
  it("applies an all-contracts frame and marks a shut stock market closed", () => {
    const { state, saw } = figuresOf(saved.tickerAll)
    expect(saw).toBe(true)
    expect(state.prices.get("BTCUSDC")).toBeGreaterThan(0)
    expect(state.open.get("SAMSUNGUSDC")).toBe(false)
    expect(state.open.get("BTCUSDC")).toBe(true)
  })

  it("answers edgeX's ping with the same time", () => {
    const { replies, saw } = figuresOf(saved.ping)
    expect(saw).toBe(false)
    expect(replies).toEqual([{ type: "pong", time: saved.ping.time }])
  })

  it("ignores a contract the catalogue does not list", () => {
    const frame = structuredClone(saved.tickerAll)
    frame.content.data = frame.content.data.map((row) => ({ ...row, contractName: `X${row.contractName}` }))
    expect(figuresOf(frame).saw).toBe(false)
  })
})

describe("edgeX's candles and funding", () => {
  it("turns a newest-first page into bars oldest first", () => {
    const bars = toEdgexBars(saved.klinePage)
    expect(bars).toHaveLength(saved.klinePage.dataList.length)
    expect(bars[0].openTime).toBeLessThan(bars.at(-1)!.openTime)
    const newest = saved.klinePage.dataList[0]
    expect(bars.at(-1)).toEqual({
      openTime: Number(newest.klineTime),
      open: Number(newest.open),
      high: Number(newest.high),
      low: Number(newest.low),
      close: Number(newest.close),
      volume: Number(newest.size),
    })
  })

  it("keeps only settlements, four hours apart, inside the window", () => {
    const rates = toEdgexFundingRates(saved.fundingSettlements, 0, Number.MAX_SAFE_INTEGER)
    expect(rates).toHaveLength(saved.fundingSettlements.dataList.length)
    for (let at = 1; at < rates.length; at += 1) {
      expect(rates[at].time - rates[at - 1].time).toBe(4 * 3_600_000)
    }
    // The minute-by-minute forecast rows are not settlements.
    expect(toEdgexFundingRates(saved.fundingForecasts, 0, Number.MAX_SAFE_INTEGER)).toEqual([])
  })
})
