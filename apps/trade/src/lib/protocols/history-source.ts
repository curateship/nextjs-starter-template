import { coinNameFor, binanceSymbolFor } from "@/lib/protocols/binance/translate"
import {
  marketKey,
  parseMarketKey,
  type MarketKey,
} from "@/lib/protocols/contracts"
import { dukascopyInstrumentFor } from "@/lib/protocols/dukascopy/instruments"

/**
 * Where a market's older candles come from.
 *
 * Every exchange remembers a different amount: Hyperliquid about 5,000 bars,
 * Lighter a few months of a stock that has traded for years. A candle from
 * last Tuesday is finished and the same everywhere, so the store keeps each
 * market's history once, under the key of the source with the longest memory.
 * Binance supplies the coins. Dukascopy supplies the stocks, indices, metals
 * and currency pairs. Binance and Dukascopy map to themselves.
 *
 * Tyler, 2 Sep 2026: "Dukascopy is for the stocks, Binance is for cryptos."
 *
 * Null is an answer: the market keeps its own key, its chart shows what the
 * venue has, and the backtest picker says "history from the exchange only".
 * Nothing is guessed. Browser-safe like `contracts.ts`, and protocol-aware
 * on purpose, which is why it lives in this folder.
 */

/** A source key is a market that maps to itself. */
export function isHistorySource(key: MarketKey): boolean {
  return historySourceFor(key) === key
}

export function historySourceFor(key: MarketKey): MarketKey | null {
  const ref = parseMarketKey(key)
  if (!ref) return null

  switch (ref.protocol) {
    case "binance":
    case "dukascopy":
      return ref.network === "mainnet" ? key : null
    case "hyperliquid": {
      const colon = ref.marketId.indexOf(":")
      if (colon === -1) return coinSource(ref.marketId)
      // The `xyz` sub-exchange is Hyperliquid's stocks, indices, metals and
      // currency pairs. Its other sub-exchanges list coins under their own
      // rules, and Binance's history for the same letters is not theirs.
      const venue = ref.marketId.slice(0, colon)
      const name = ref.marketId.slice(colon + 1)
      return venue === "xyz" ? dukascopySource(name, true) : null
    }
    case "aster":
      return bareNameSource(ref.marketId.replace(/USDT$/, ""))
    case "lighter":
      // Lighter's spot pairs carry a slash and are not perpetuals.
      if (ref.marketId.includes("/")) return null
      return bareNameSource(ref.marketId)
    case "kucoin":
      // KuCoin calls Bitcoin XBT in its ids and lists coins only.
      return coinSource(
        ref.marketId.replace(/USDTM?$/, "").replace(/^XBT$/, "BTC")
      )
    case "phemex":
      return coinSource(ref.marketId.replace(/USDT$/, ""))
    case "solana":
      // A Solana market id is the coin's mint address, not a name, and the
      // same ticker can belong to two different mints. Nothing is guessed:
      // the chart task decides which coins map to Binance, by symbol.
      return null
  }
}

/**
 * A name from a venue that says nothing about what kind of market it is.
 *
 * A name Dukascopy knows as a stock, metal, index or pair goes there. The
 * rest are coins. The one trap is a coin whose letters spell a stock, and
 * `COINS_THAT_SPELL_A_US_STOCK` holds those.
 */
function bareNameSource(name: string): MarketKey | null {
  return dukascopySource(name, false) ?? coinSource(name)
}

function dukascopySource(name: string, knownNotACoin: boolean): MarketKey | null {
  const instrument = dukascopyInstrumentFor(name, knownNotACoin)
  return instrument
    ? marketKey({ protocol: "dukascopy", network: "mainnet", marketId: instrument })
    : null
}

/** The Binance market for a coin name, or null when Binance could not have it. */
function coinSource(name: string): MarketKey | null {
  // Venues that write "a thousand of them" as `1000PEPE` mean the same coin
  // this app calls `kPEPE`, which is how Binance's own catalogue names it.
  const coin = coinNameFor(`${name}USDT`)
  if (!coin || binanceSymbolFor(coin) === null) return null
  return marketKey({ protocol: "binance", network: "mainnet", marketId: coin })
}
