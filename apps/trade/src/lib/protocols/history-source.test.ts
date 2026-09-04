import { describe, expect, it } from "vitest"

import { SOLANA_BINANCE_HISTORY } from "@/lib/protocols/solana/history"
import { historySourceFor, isHistorySource } from "@/lib/protocols/history-source"

/**
 * Every venue's name for a market lands on the one source that keeps its
 * history, or on nothing. Mapping a coin to a stock's history would draw the
 * wrong prices under the right name, which is the worst failure here, so the
 * names below are real ones read off the venues on 2 Sep 2026.
 */

const BINANCE_BTC = "binance:mainnet:BTC"
const TSLA = "dukascopy:mainnet:tslaususd"

describe("coins", () => {
  it("answers Binance for BTC on every venue", () => {
    expect(historySourceFor("hyperliquid:mainnet:BTC")).toBe(BINANCE_BTC)
    expect(historySourceFor("lighter:mainnet:BTC")).toBe(BINANCE_BTC)
    expect(historySourceFor("aster:mainnet:BTCUSDT")).toBe(BINANCE_BTC)
    expect(historySourceFor("phemex:mainnet:BTCUSDT")).toBe(BINANCE_BTC)
    expect(historySourceFor("kucoin:mainnet:XBTUSDTM")).toBe(BINANCE_BTC)
    expect(historySourceFor(BINANCE_BTC)).toBe(BINANCE_BTC)
  })

  it("keeps the thousand-of-them coins on one name", () => {
    expect(historySourceFor("hyperliquid:mainnet:kPEPE")).toBe(
      "binance:mainnet:kPEPE"
    )
    expect(historySourceFor("lighter:mainnet:1000PEPE")).toBe(
      "binance:mainnet:kPEPE"
    )
    expect(historySourceFor("aster:mainnet:1000BONKUSDT")).toBe(
      "binance:mainnet:kBONK"
    )
  })

  it("keeps a coin whose letters spell a stock on Binance", () => {
    // Sun Communities is `suiususd`; the Sui coin is not.
    expect(historySourceFor("lighter:mainnet:SUI")).toBe("binance:mainnet:SUI")
    expect(historySourceFor("lighter:mainnet:WEN")).toBe("binance:mainnet:WEN")
  })
})

describe("stocks, metals, indices and currency pairs", () => {
  it("answers Dukascopy's TSLA for TSLA on Hyperliquid, Lighter and Aster", () => {
    expect(historySourceFor("hyperliquid:mainnet:xyz:TSLA")).toBe(TSLA)
    expect(historySourceFor("lighter:mainnet:TSLA")).toBe(TSLA)
    expect(historySourceFor("aster:mainnet:TSLAUSDT")).toBe(TSLA)
  })

  it("finds a stock Dukascopy files under its old ticker", () => {
    // Facebook became Meta in 2021; Dukascopy's id did not follow.
    expect(historySourceFor("hyperliquid:mainnet:xyz:META")).toBe(
      "dukascopy:mainnet:fbususd"
    )
    expect(historySourceFor("aster:mainnet:METAUSDT")).toBe(
      "dukascopy:mainnet:fbususd"
    )
  })

  it("names the aliased instruments", () => {
    expect(historySourceFor("hyperliquid:mainnet:xyz:GOLD")).toBe(
      "dukascopy:mainnet:xauusd"
    )
    expect(historySourceFor("lighter:mainnet:XAU")).toBe(
      "dukascopy:mainnet:xauusd"
    )
    expect(historySourceFor("aster:mainnet:XAUUSDT")).toBe(
      "dukascopy:mainnet:xauusd"
    )
    expect(historySourceFor("hyperliquid:mainnet:xyz:SP500")).toBe(
      "dukascopy:mainnet:usa500idxusd"
    )
    expect(historySourceFor("lighter:mainnet:US500")).toBe(
      "dukascopy:mainnet:usa500idxusd"
    )
    expect(historySourceFor("hyperliquid:mainnet:xyz:CL")).toBe(
      "dukascopy:mainnet:lightcmdusd"
    )
    expect(historySourceFor("lighter:mainnet:WTI")).toBe(
      "dukascopy:mainnet:lightcmdusd"
    )
    expect(historySourceFor("hyperliquid:mainnet:xyz:EUR")).toBe(
      "dukascopy:mainnet:eurusd"
    )
    expect(historySourceFor("lighter:mainnet:EURUSD")).toBe(
      "dukascopy:mainnet:eurusd"
    )
  })

  it("maps a Dukascopy market to itself", () => {
    expect(historySourceFor(TSLA)).toBe(TSLA)
    expect(isHistorySource(TSLA)).toBe(true)
    expect(isHistorySource("lighter:mainnet:TSLA")).toBe(false)
  })
})

describe("markets nobody can name", () => {
  it("answers null rather than guessing", () => {
    // A Lighter spot pair, a Hyperliquid sub-exchange coin, the yen quoted
    // the wrong way round, and a Japanese chip maker Dukascopy does not list.
    expect(historySourceFor("lighter:mainnet:AAVE/USDC")).toBeNull()
    expect(historySourceFor("hyperliquid:mainnet:hyna:HYPE")).toBeNull()
    expect(historySourceFor("hyperliquid:mainnet:xyz:JPY")).toBeNull()
    expect(historySourceFor("hyperliquid:mainnet:xyz:KIOXIA")).toBeNull()
  })

  it("names what a bare ticker would be on Binance, and leaves the checking to the server", () => {
    // Lighter says nothing about what kind of market KIOXIA is. The rule can
    // only say what Binance would call it; `resolveHistorySource` on the
    // server checks Binance's own list before anything is fetched.
    expect(historySourceFor("lighter:mainnet:KIOXIA")).toBe(
      "binance:mainnet:KIOXIA"
    )
  })

  it("refuses a key that is not a market key, or a practice network", () => {
    expect(historySourceFor("nonsense")).toBeNull()
    expect(historySourceFor("binance:testnet:BTC")).toBeNull()
    expect(historySourceFor("lighter:mainnet:BTC USDT")).toBeNull()
  })
})

describe("Solana borrows by mint address, never by name", () => {
  it("lends Binance history to a pinned coin", () => {
    // Wrapped SOL is the coin everyone means by SOL, and Binance lists it.
    expect(
      historySourceFor(
        "solana:mainnet:So11111111111111111111111111111111111111112"
      )
    ).toBe("binance:mainnet:SOL")
  })

  it("lends nothing to a coin that merely calls itself something", () => {
    // Anyone can mint a coin and name it BTC. Nothing is borrowed unless the
    // mint itself is pinned, so an impostor draws no chart at all.
    expect(
      historySourceFor(
        "solana:mainnet:BTCimposter1111111111111111111111111111111"
      )
    ).toBeNull()
  })

  it("lends nothing where two Solana coins share one ticker", () => {
    // TRUMP is two different verified coins on Solana, so neither may claim
    // Binance's chart. Both mints are absent from the pinned list.
    for (const mint of [
      "6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN",
      "HaP8r3ksG76PhQLTqR8FYBeNiQpejcFbQmiHbg787Ut1",
    ]) {
      expect(historySourceFor(`solana:mainnet:${mint}`)).toBeNull()
    }
  })

  it("keeps every pinned coin pointing at a market Binance really lists", () => {
    // The pinned list is hand-carried data, so this walks all of it rather
    // than trusting the day it was generated.
    for (const [mint, coin] of Object.entries(SOLANA_BINANCE_HISTORY)) {
      const source = historySourceFor(`solana:mainnet:${mint}`)
      expect(source, `${coin} (${mint})`).toBe(`binance:mainnet:${coin}`)
    }
    expect(Object.keys(SOLANA_BINANCE_HISTORY).length).toBeGreaterThan(30)
    // One mint each: two entries pointing at one Binance coin would be two
    // Solana coins claiming the same history.
    const coins = Object.values(SOLANA_BINANCE_HISTORY)
    expect(new Set(coins).size).toBe(coins.length)
  })
})
