import { formatPrice, formatSize, formatUsd } from "@/lib/trade/format"

/** The exchange whose prices the converter quotes. */
export const CONVERTER_EXCHANGE = "Hyperliquid"

/** A price read longer ago than this is marked old on the page. */
export const PRICE_OLD_AFTER_MS = 60_000

/**
 * A coin needs this many dollars traded over the last day for its own page
 * in the sitemap. A thinly traded coin still converts, and its address still
 * works, but search engines are told not to list it: a pile of near-empty
 * pages drags the whole site down in search.
 */
export const OWN_PAGE_MIN_VOLUME_USD = 1_000_000

/** The coin the plain `/tools/convert` page opens on. */
export const DEFAULT_COIN = "BTC"

/** The largest amount either box takes, in coins or dollars. */
export const MAX_AMOUNT = 1_000_000_000

export type ConverterCoin = {
  /** The coin as the exchange lists it: "BTC", "kPEPE". */
  symbol: string
  /** Dollars for one coin, or null when the exchange has not sent one. */
  price: number | null
  /** Whether the coin traded enough for its page to be listed in search. */
  ownPage: boolean
}

/** Every visitor's copy of the prices, built from the server's kept copy. */
export type ConverterPrices = {
  exchange: string
  /** Busiest first. */
  coins: ConverterCoin[]
  /**
   * How long before the server answered the exchange last sent prices, or
   * null when it has sent none since the server started.
   */
  ageMs: number | null
}

/** Which box the visitor types in: coins, or dollars. */
export type Direction = "coin-to-usd" | "usd-to-coin"

/**
 * The other box's number. 0.5 BTC at $64,000 is $32,000; $1,000 at $150
 * buys 6.67 SOL. Null without a usable price.
 */
export function convert(
  amount: number,
  price: number | null,
  direction: Direction
): number | null {
  if (price === null || !(price > 0) || !Number.isFinite(amount)) return null
  return direction === "coin-to-usd" ? amount * price : amount / price
}

/** The address piece for a coin: "BTC" becomes "btc-usd". */
export function pairSlug(symbol: string): string {
  return `${symbol.toLowerCase()}-usd`
}

/**
 * The coin an address piece names, matched without caring about capitals, or
 * null when it names no listed coin. "btc-usd" finds "BTC", "kpepe-usd" finds
 * "kPEPE".
 */
export function coinForSlug<T extends { symbol: string }>(
  coins: readonly T[],
  slug: string
): T | null {
  const match = /^(.+)-usd$/.exec(slug.toLowerCase())
  if (!match) return null
  return coins.find((coin) => coin.symbol.toLowerCase() === match[1]) ?? null
}

/** Whether a price read this long ago is marked old. */
export function isPriceOld(ageMs: number): boolean {
  return ageMs > PRICE_OLD_AFTER_MS
}

/** "3 seconds ago", "1 minute ago", "2 hours ago". */
export function formatAge(ageMs: number): string {
  const seconds = Math.max(0, Math.floor(ageMs / 1000))
  if (seconds < 60) return plural(seconds, "second")
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return plural(minutes, "minute")
  return plural(Math.floor(minutes / 60), "hour")
}

function plural(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? "" : "s"} ago`
}

/**
 * Dollars on the converter: to the cent from a dollar up, "$32,000.00", and
 * five significant digits below it, so 1 kBONK at $0.018342 does not read
 * "$0.02".
 */
export function formatConvertedUsd(value: number): string {
  return value !== 0 && Math.abs(value) < 1 ? formatPrice(value) : formatUsd(value)
}

/** Coins on the converter: "0.5", "6.666667". */
export function formatConvertedCoins(value: number): string {
  return formatSize(value)
}

/**
 * A Hyperliquid coin whose name starts with a small "k" is a thousand of the
 * coin, so its price is for a thousand. "kPEPE" gives "PEPE". Null otherwise.
 */
export function thousandOf(symbol: string): string | null {
  const match = /^k([A-Z0-9]+)$/.exec(symbol)
  return match ? match[1] : null
}
