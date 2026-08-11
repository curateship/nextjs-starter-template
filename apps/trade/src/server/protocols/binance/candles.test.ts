import { describe, expect, it } from "vitest"

import { binanceSymbolFor } from "@/server/protocols/binance/candles"

/**
 * Which coin is which on Binance.
 *
 * A backtest that selects Binance uses Binance perps, so every chosen coin has
 * to be turned into the right Binance symbol. Naming the wrong symbol would
 * test a different coin under the right name, the worst failure here.
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

  it("does not freeze an old opinion about which coins Binance lists", () => {
    expect(binanceSymbolFor("HYPE")).toBe("HYPEUSDT")
    expect(binanceSymbolFor("PURR")).toBe("PURRUSDT")
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
