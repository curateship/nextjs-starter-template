import { describe, expect, it } from "vitest"

import { binanceSymbolFor } from "@/server/trade/backtest/binance-history"

/**
 * Which coin is which on Binance.
 *
 * The history for a backtest comes from Binance perps, so every coin the run
 * names has to be turned into a Binance symbol — and the ones that cannot be
 * are skipped out loud rather than quietly fetched as something else. Naming
 * the wrong symbol would test a different coin under the right name, which is
 * the worst failure this whole file could have.
 */
describe("a coin as its Binance symbol", () => {
  it("adds USDT to an ordinary coin", () => {
    expect(binanceSymbolFor("BTC")).toBe("BTCUSDT")
    expect(binanceSymbolFor("ETH")).toBe("ETHUSDT")
  })

  it("turns the k prefix into Binance's 1000", () => {
    // Hyperliquid writes the 1000x meme coins as kPEPE; Binance writes them as
    // 1000PEPE. The same coin, and getting it wrong prices it 1000x out.
    expect(binanceSymbolFor("kPEPE")).toBe("1000PEPEUSDT")
    expect(binanceSymbolFor("kBONK")).toBe("1000BONKUSDT")
  })

  it("refuses a coin Binance has no perp for", () => {
    expect(binanceSymbolFor("HYPE")).toBeNull()
    expect(binanceSymbolFor("PURR")).toBeNull()
  })

  it("refuses the sub-exchange markets", () => {
    // `xyz:MSFT`, `hyna:HYPE`, `para:STX` are venues of their own inside
    // Hyperliquid and are not Binance perps at all.
    expect(binanceSymbolFor("xyz:MSFT")).toBeNull()
    expect(binanceSymbolFor("hyna:HYPE")).toBeNull()
    expect(binanceSymbolFor("para:STX")).toBeNull()
  })

  it("refuses anything that is not a plain coin name", () => {
    // The symbol goes into a URL, so a name with anything odd in it is not a
    // market to look up.
    expect(binanceSymbolFor("../etc/passwd")).toBeNull()
    expect(binanceSymbolFor("BTC USDT")).toBeNull()
    expect(binanceSymbolFor("")).toBeNull()
  })
})
