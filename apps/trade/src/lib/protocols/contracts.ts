/**
 * The shapes every screen and every exchange module agree on.
 *
 * This file is the whole boundary. Screens import these types and nothing
 * else; an exchange module's job is to produce them and keep its own SDK, its
 * endpoints and its response shapes to itself. A second exchange is a new
 * module that fills these same shapes — never a change to a screen.
 *
 * Browser-safe on purpose: nothing in here may import `@/server/*` or an
 * exchange package. `src/server/protocols/fence.test.ts` enforces both.
 */

/**
 * Every exchange this app knows how to talk to.
 *
 * A union rather than `string` so that a typo is a compile error, and so
 * adding an exchange is a deliberate edit here — the one shared file — plus a
 * new module behind it, never a stray name invented at a call site.
 */
export type ProtocolId = "hyperliquid"

/** The two kinds of network an exchange runs: real money, or practice. */
export type NetworkId = "mainnet" | "testnet"

/**
 * What one protocol can and cannot do. Screens read these flags instead of
 * ever asking which protocol they are talking to.
 *
 * One flag today because only one adapter exists. Order types, margin modes
 * and protective orders get their flags when the screens that need them are
 * built — a capability nobody reads is a guess, and guesses drift.
 */
export type ProtocolCapabilities = {
  /** Can list its markets with live figures. */
  markets: boolean
}

/**
 * How a saved market is written down: protocol, network, and the market's own
 * id, joined into one string — `"hyperliquid:mainnet:BTC"`.
 *
 * Never the symbol alone. BTC exists on every exchange, so a bare "BTC" stops
 * meaning anything the day a second protocol arrives. Favourites use this key
 * today; alerts, scanner rules and bots use it when they are built.
 */
export type MarketKey = string

export type MarketRef = {
  protocol: ProtocolId
  network: NetworkId
  /** The exchange's own id for the market — its coin name on Hyperliquid. */
  marketId: string
}

const KNOWN_PROTOCOLS: readonly ProtocolId[] = ["hyperliquid"]
const KNOWN_NETWORKS: readonly NetworkId[] = ["mainnet", "testnet"]

/** The one way a market key is ever built. */
export function marketKey(ref: MarketRef): MarketKey {
  return `${ref.protocol}:${ref.network}:${ref.marketId}`
}

/**
 * The one way a market key is ever read. Returns null for anything that is
 * not a well-formed key for a protocol and network this app knows — a saved
 * key from a bad hand-edit or an old build resolves to "not available", never
 * to some other market.
 */
export function parseMarketKey(key: string): MarketRef | null {
  const first = key.indexOf(":")
  const second = key.indexOf(":", first + 1)
  if (first <= 0 || second <= first + 1 || second === key.length - 1) {
    return null
  }

  const protocol = key.slice(0, first) as ProtocolId
  const network = key.slice(first + 1, second) as NetworkId
  const marketId = key.slice(second + 1)

  if (!KNOWN_PROTOCOLS.includes(protocol)) return null
  if (!KNOWN_NETWORKS.includes(network)) return null
  return { protocol, network, marketId }
}

/**
 * One market, in the app's own words. This is what screens draw — no screen
 * ever sees an exchange's raw response.
 *
 * Figures are numbers, not the exchange's strings, and the fractions are
 * fractions: `change24h` of 0.024 is a 2.4% rise. Formatting belongs to the
 * screen, precision to the exchange module that produced the row.
 */
export type MarketRow = {
  key: MarketKey
  /** The exchange's own id — what goes in the key. */
  marketId: string
  /** What to print. The same as marketId on Hyperliquid. */
  symbol: string
  /**
   * Where the exchange serves this market's logo, or null when it has none.
   * Carried as data so no screen ever builds an exchange's URL itself.
   */
  iconUrl: string | null
  /** Last mark price, in dollars. */
  price: number
  /** Move over the last day as a fraction, or null when the exchange had no yesterday price. */
  change24h: number | null
  /** Dollars traded over the last day. */
  volume24hUsd: number
  /** The hourly funding rate as a fraction, or null where funding does not apply. */
  fundingHourly: number | null
  /** Open interest in dollars, or null where the exchange does not say. */
  openInterestUsd: number | null
}

/**
 * A protocol's market list plus who it came from, so every screen can say
 * which exchange and which network it is showing — the label that stops two
 * markets with the same name being read as each other.
 */
export type MarketCatalog = {
  protocol: ProtocolId
  protocolLabel: string
  network: NetworkId
  networkLabel: string
  rows: MarketRow[]
}

/**
 * The chart timeframes every protocol is asked in. The strings double as the
 * stored per-browser choice, so they never change meaning once shipped.
 */
export const CANDLE_INTERVALS = ["1m", "5m", "15m", "1h", "4h", "1d"] as const

export type CandleInterval = (typeof CANDLE_INTERVALS)[number]

/**
 * One bar of price history, in the app's own words: when it opened (epoch
 * milliseconds), the four prices, and how much traded. Screens draw these;
 * whatever shape the exchange sent stops at its own module.
 */
export type CandleBar = {
  openTime: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}
