import type { LiveFigures } from "@/lib/protocols/contracts"

/**
 * The pure translation rules both halves of the Hyperliquid module share —
 * the server fetches (`src/server/protocols/hyperliquid/`) and the browser
 * stream (`./stream.ts`). One home so the two sides can never disagree about
 * what a market is called or how a figure is read.
 *
 * Nothing here touches the exchange package or the network; it is data in,
 * data out, and safe everywhere.
 */

/** A figure the exchange sent as a decimal string, or null if it was junk. */
export function num(value: string): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

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
