import {
  marketChartHref,
  marketSymbol,
  parseMarketKey,
} from "@/lib/protocols/contracts"

export const MAX_PINNED_MARKETS = 5

/** Discard malformed and unsupported keys while preserving pin order. */
export function normalizePinnedMarkets(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [
    ...new Set(
      value.filter(
        (key): key is string =>
          typeof key === "string" &&
          key.length <= 180 &&
          key.trim() === key &&
          parseMarketKey(key) !== null &&
          marketChartHref(key) !== null
      )
    ),
  ].slice(0, MAX_PINNED_MARKETS)
}

export function changePinnedMarkets(
  pins: readonly string[],
  key: string,
  pinned: boolean
): string[] {
  const current = normalizePinnedMarkets(pins)
  if (!pinned) return current.filter((pin) => pin !== key)
  if (!normalizePinnedMarkets([key]).length)
    throw new Error("That market cannot be pinned to the header.")
  if (current.includes(key)) return current
  if (current.length === MAX_PINNED_MARKETS) {
    throw new Error(
      `You already pinned ${current.map(marketSymbol).join(", ")}. Unpin one before adding another market.`
    )
  }
  return [...current, key]
}

export type PinnedMarketQuote = {
  key: string
  symbol: string
  price: number | null
  change24h: number | null
}
