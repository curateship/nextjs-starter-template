import type { LiveFigures, MarketCategory } from "@/lib/protocols/contracts"
import { num } from "@/lib/protocols/number"

export { num } from "@/lib/protocols/number"

/**
 * The pure translation rules both halves of the Hyperliquid module share —
 * the server fetches (`src/server/protocols/hyperliquid/`) and the browser
 * stream (`./stream.ts`). One home so the two sides can never disagree about
 * what a market is called or how a figure is read.
 *
 * Nothing here touches the exchange package or the network; it is data in,
 * data out, and safe everywhere.
 */

/**
 * The one rule for a market's id across venues: sub-exchange assets arrive
 * namespaced ("xyz:AAPL"); a bare name gets the venue put on here, because
 * ids must be unique across venues or two markets share one key. The main
 * exchange (empty venue name) keeps bare names.
 */
export function namespaceMarketId(dexName: string, assetName: string): string {
  if (!dexName) return assetName
  return assetName.startsWith(`${dexName}:`)
    ? assetName
    : `${dexName}:${assetName}`
}

export type { LiveFigures }

/**
 * A price the exchange would actually accept for an order.
 *
 * Hyperliquid takes at most five significant digits, and at most
 * `6 − szDecimals` decimal places — a market whose size goes to three decimals
 * gets three decimal places of price. Whole numbers are always allowed however
 * long they run, which is the only reason a $118,204 order is not forced to
 * $118,200.
 *
 * Pure arithmetic, so it can be checked without the exchange. A price that
 * cannot be a price at all comes back untouched for the caller to refuse.
 */
export function roundOrderPx(px: number, sizeDecimals: number | null): number {
  if (!Number.isFinite(px) || px <= 0) return px
  const significant = px >= 1e5 ? Math.round(px) : Number(px.toPrecision(5))
  const factor = 10 ** Math.max(0, 6 - (sizeDecimals ?? 0))
  return Math.round(significant * factor) / factor
}

/**
 * The exchange's category vocabulary into the app's — the same mapping the
 * old app proved. A market the exchange left uncategorised is a crypto coin
 * on the main exchange (that is all the main exchange lists) and "other" on
 * a sub-exchange, where it could be anything.
 */
export function normalizeMarketCategory(
  category: string | undefined,
  isMainVenue: boolean
): MarketCategory {
  switch (category?.toLowerCase()) {
    case "crypto":
      return "crypto"
    case "stocks":
    case "preipo":
      return "stocks"
    case "indices":
      return "indices"
    case "commodities":
      return "commodities"
    case "fx":
      return "forex"
    default:
      return isMainVenue ? "crypto" : "other"
  }
}

/**
 * One market's streamed context into live figures — the same arithmetic the
 * HTTP translate uses, so a figure never depends on which road it travelled.
 * Null when the update's price is junk; the previous good figures stand.
 */
export function toLiveFigures(ctx: {
  markPx: string
  prevDayPx: string
  dayNtlVlm: string
  funding: string
  openInterest: string
}): LiveFigures | null {
  const price = num(ctx.markPx)
  if (price === null) return null
  const prevDay = num(ctx.prevDayPx)
  const openInterest = num(ctx.openInterest)
  return {
    price,
    change24h:
      prevDay !== null && prevDay > 0 ? (price - prevDay) / prevDay : null,
    volume24hUsd: num(ctx.dayNtlVlm) ?? 0,
    fundingHourly: num(ctx.funding),
    openInterestUsd: openInterest !== null ? openInterest * price : null,
  }
}

/** Two sets of live figures that would draw identically, compared cheaply. */
export function sameFigures(a: LiveFigures, b: LiveFigures): boolean {
  return (
    a.price === b.price &&
    a.change24h === b.change24h &&
    a.volume24hUsd === b.volume24hUsd &&
    a.fundingHourly === b.fundingHourly &&
    a.openInterestUsd === b.openInterestUsd
  )
}
