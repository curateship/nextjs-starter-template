import { binanceSymbolFor } from "@/server/trade/backtest/binance-history"

/**
 * Which coins Binance actually has history for.
 *
 * The picker used to list Hyperliquid's markets while the history came from
 * Binance, so a run could set off with a hundred coins and come back having
 * tested fifty-three. The missing ones were not a fault — Binance simply never
 * listed them — but nobody could tell that until the run had finished.
 *
 * Asking Binance up front turns that into something the list can say before a
 * run starts. This is the only question asked of it: does this perp exist? The
 * prices themselves still come from `binance-history.ts`.
 */

const BINANCE_EXCHANGE_INFO = "https://fapi.binance.com/fapi/v1/exchangeInfo"

/**
 * How long the answer is kept.
 *
 * Binance lists a new perp every week or two, never every minute, and this list
 * is read every time somebody opens the step's panel. Ten minutes keeps the
 * panel instant without ever being meaningfully out of date.
 */
const CACHE_MS = 10 * 60 * 1000

type Cached = { at: number; symbols: Set<string> }

// One cache for the process, not one per request: every panel open would
// otherwise be a fresh call to Binance for a list that changes fortnightly.
const scope = globalThis as { __binancePerpCache?: Cached }

type ExchangeInfo = {
  symbols?: Array<{
    symbol?: string
    status?: string
    contractType?: string
    quoteAsset?: string
  }>
}

/**
 * Every USDT perpetual Binance is currently trading, by symbol.
 *
 * Anything not `TRADING` is left out on purpose: a delisted or halted market
 * still appears in the list but its history stops dead, which would put a coin
 * in the picker that quietly tests a shorter window than it says.
 */
export async function listBinancePerpSymbols(): Promise<Set<string>> {
  const cached = scope.__binancePerpCache
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.symbols

  const response = await fetch(BINANCE_EXCHANGE_INFO)
  if (!response.ok) {
    // A stale list beats no list: the panel can still be used, and the worst
    // case is a coin that turns out to be skipped, which it already handles.
    if (cached) return cached.symbols
    throw new Error(`Binance exchangeInfo failed: ${response.status}`)
  }

  const body = (await response.json()) as ExchangeInfo
  const symbols = new Set<string>()
  for (const one of body.symbols ?? []) {
    if (one.status !== "TRADING") continue
    if (one.contractType !== "PERPETUAL") continue
    if (one.quoteAsset !== "USDT") continue
    if (one.symbol) symbols.add(one.symbol)
  }

  // An empty answer is a broken answer, not "Binance has no markets". Keeping
  // the old list is the honest fallback.
  if (symbols.size === 0 && cached) return cached.symbols

  scope.__binancePerpCache = { at: Date.now(), symbols }
  return symbols
}

/**
 * Whether this coin can be tested at all.
 *
 * Two questions in one, and both have to be yes: does the name map to a Binance
 * symbol (the `k`-prefix coins and the sub-exchange markets do not), and is
 * Binance trading it today.
 */
export function testableOnBinance(
  coin: string,
  symbols: ReadonlySet<string>
): boolean {
  const symbol = binanceSymbolFor(coin)
  return symbol !== null && symbols.has(symbol)
}
