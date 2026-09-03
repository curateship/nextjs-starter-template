/**
 * Binance's names for coins, and the app's names for Binance's.
 *
 * Browser-safe on purpose, like every other `lib/protocols/<venue>/translate`
 * file: the history-source map needs to name a Binance market for a coin it
 * saw on another venue, and that map may not reach into `@/server`.
 */

/**
 * A coin name as Binance's perp symbol, or null when it is not one.
 *
 * Null is an answer, not a failure: a Hyperliquid-only token, or one of the
 * sub-exchange markets whose names carry a prefix, simply cannot be tested
 * against Binance history — and the run says so as a skipped coin.
 */
export function binanceSymbolFor(coin: string): string | null {
  // An empty name would otherwise become the symbol "USDT", which looks real
  // enough to be fetched and is not a market at all.
  if (!/^[A-Za-z0-9:]+$/.test(coin)) return null
  // Sub-exchange markets (`xyz:MSFT`, `hyna:HYPE`, `para:STX`) are not Binance
  // perps at all. Refused by the shape check below, but named here so the
  // reason is obvious rather than an accident of a regex.
  if (coin.includes(":")) return null
  const symbol = /^k[A-Z]/.test(coin)
    ? `1000${coin.slice(1)}USDT`
    : `${coin}USDT`
  // Binance symbols are uppercase alphanumeric. Anything else is not a real
  // market — and letting a stray name through would put it in a URL.
  return /^[A-Z0-9]+$/.test(symbol) ? symbol : null
}

/**
 * The app's coin name for a Binance symbol — the inverse of `binanceSymbolFor`.
 *
 * `BTCUSDT` is BTC. `1000PEPEUSDT` is this app's `kPEPE`, because both apps
 * write "a thousand of them" the same way the exchange that listed it did, and
 * a market called `1000PEPE` in one place and `kPEPE` in another is two names
 * for one thing.
 */
export function coinNameFor(symbol: string): string | null {
  if (!symbol.endsWith("USDT")) return null
  const base = symbol.slice(0, -"USDT".length)
  if (base.length === 0) return null
  return base.startsWith("1000") && base.length > 4 ? `k${base.slice(4)}` : base
}
