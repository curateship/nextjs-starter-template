import type { MarketRow } from "@/lib/protocols/contracts"

/**
 * Put known 24-hour moves in gain-to-loss order. A missing change is not zero,
 * so it stays after every market whose move the exchange actually reported.
 */
export function compareMarketChange24h(
  left: MarketRow,
  right: MarketRow,
  descending = true
) {
  if (left.change24h === null) return right.change24h === null ? 0 : 1
  if (right.change24h === null) return -1
  return descending
    ? right.change24h - left.change24h
    : left.change24h - right.change24h
}
