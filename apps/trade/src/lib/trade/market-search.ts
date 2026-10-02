import type { MarketRow, ProtocolId } from "@/lib/protocols/contracts"

/**
 * The rules behind the header's market search, kept away from the server read
 * so they can be tested without an exchange.
 */

/** Fewer letters than this matches half the app and means nothing. */
export const LEAST_SEARCH_LETTERS = 2

/** The most rows one search hands back. */
export const MOST_SEARCH_HITS = 30

/**
 * One market found by the header's search field.
 *
 * The ticker and the exchange it belongs to, which is the whole point of the
 * field: the same coin is listed by eight exchanges and the name alone never
 * says which one a row would trade on. `subExchange` is carried for the venues
 * that host more than one book, so two rows reading "BTC" can still be told
 * apart.
 */
export type MarketSearchHit = {
  key: string
  symbol: string
  protocol: ProtocolId
  protocolLabel: string
  subExchange: string | null
  /** Where clicking the row goes, or null for a venue with no screen yet. */
  href: string | null
}

export type MarketSearchAnswer = {
  hits: MarketSearchHit[]
  /** Matches beyond the ones returned, so the list can say "and 40 more". */
  more: number
  /** Exchanges that would not answer, by their printed names. */
  unavailable: string[]
}

/** A match waiting to be ordered: the hit plus what it is ordered by. */
export type MarketMatch = {
  rank: number
  volume24hUsd: number
  hit: MarketSearchHit
}

/**
 * How well a market answers what was typed. Lower sorts first, and null means
 * it does not answer at all.
 *
 * An exact ticker beats a ticker that starts with the words, which beats one
 * that merely contains them. Typing "btc" must not bury Bitcoin under
 * "WBTC-USDC", and ordering by name alone does exactly that. The exchange's own
 * id is matched last, so pasting a contract address still finds the market
 * without letting ids outrank real tickers.
 */
export function matchMarketRank(row: MarketRow, asked: string): number | null {
  const symbol = row.symbol.toLowerCase()
  const marketId = row.marketId.toLowerCase()
  if (symbol === asked || marketId === asked) return 0
  if (symbol.startsWith(asked)) return 1
  if (symbol.includes(asked)) return 2
  if (marketId.includes(asked)) return 3
  return null
}

/**
 * Best match first, and the busiest market inside each tier. Between two
 * exchanges listing the same coin, the one with the money in it is the one
 * somebody meant.
 */
export function orderMarketMatches(
  found: readonly MarketMatch[]
): MarketSearchHit[] {
  return [...found]
    .sort((a, b) => a.rank - b.rank || b.volume24hUsd - a.volume24hUsd)
    .map((one) => one.hit)
}
