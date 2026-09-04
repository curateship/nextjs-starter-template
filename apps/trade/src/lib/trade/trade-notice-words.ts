import { marketSymbol } from "@/lib/protocols/contracts"
import { formatPrice, formatUsdRounded } from "@/lib/trade/format"

/**
 * The sentences the bell says about trades and flows.
 *
 * Pure and browser-safe on purpose: the server writes these into the inbox and
 * the tests read them back, so the words live where both can see them. Every
 * sentence follows the same rule as the rest of the app's words — dollars, the
 * coin's symbol, and the wallet's own label, never an id.
 */

export type TradeNoticeLevel = "info" | "warning" | "critical"

/** One price alert, using the direction fixed when the line was placed. */
export function priceAlertNoticeWords(input: {
  marketKey: string
  price: number
  direction: "above" | "below"
}): { title: string; body: string; level: TradeNoticeLevel } {
  const coin = marketSymbol(input.marketKey)
  const movement = input.direction === "above" ? "rising" : "falling"
  return {
    title: `${coin} reached ${formatPrice(input.price)} (was ${movement})`,
    body: "The price alert fired once and is now retired.",
    level: "info",
  }
}

/**
 * A drawn line's alert, said once when the price crosses it. It names the
 * shape, level or trendline, so a level's notice is never mistaken for a
 * purple price alert's, which says "reached" and never "crossed". A line
 * with a name is called by it instead of by its price, because a name the
 * person typed needs no translating; the price then moves to the body.
 */
export function drawingAlertNoticeWords(input: {
  marketKey: string
  kind: "level" | "trendline"
  /** Where the line was at the moment of the cross. */
  price: number
  direction: "above" | "below"
  name?: string | null
  /** How far past the line the price had to go, as a percentage. */
  buffer?: number | null
}): { title: string; body: string; level: TradeNoticeLevel } {
  const coin = marketSymbol(input.marketKey)
  const movement = input.direction === "above" ? "rising" : "falling"
  // Said before the rest, because it explains the price in the line above it:
  // the price went further than the number in the title.
  // Printed as it was typed rather than through a formatter, so 0.1 reads as
  // "0.1%" and not "0.10%".
  const past = input.buffer
    ? `The price had to go ${input.buffer}% past the ${input.kind}. `
    : ""
  const rest = `${past}The ${input.kind}'s alert fired once and is now off. The ${input.kind} is still on the chart.`
  if (input.name) {
    return {
      title: `${coin} crossed ${input.name} (was ${movement})`,
      body: `${input.name} was at ${formatPrice(input.price)}. ${rest}`,
      level: "info",
    }
  }
  return {
    title: `${coin} crossed your ${input.kind} at ${formatPrice(input.price)} (was ${movement})`,
    body: rest,
    level: "info",
  }
}

/** "(Main wallet)" — with the word practice added when the money is not real. */
function walletTag(walletLabel: string, practice: boolean): string {
  return practice ? `(${walletLabel}, practice)` : `(${walletLabel})`
}

/**
 * Whether a fill got into a trade or out of one.
 *
 * The bell says "entered" or "exited", never "bought" or "sold". Tyler's
 * rule: a long that is closed was not "shorted", and a long that is opened
 * was not "bought"; the person entered a trade or exited one, and the words
 * say which. The venue's own words decide when it gives them ("Close Long",
 * "Open Short"); a venue that says nothing is read from the money, because
 * only a close banks anything.
 */
export function fillWasExit(fill: {
  dir?: string
  closedPnl: number
}): boolean {
  const dir = (fill.dir ?? "").toLowerCase()
  if (dir.startsWith("close")) return true
  if (dir.startsWith("open")) return false
  return fill.closedPnl !== 0
}

/** One fill, said the moment it is written down. */
export function fillNoticeWords(fill: {
  marketKey: string
  side: "buy" | "sell"
  px: number
  sz: number
  closedPnl: number
  /** The venue's own words for the fill, "Close Long" and the rest, if any. */
  dir?: string
  /**
   * The average entry the exchange measured the close against, when it can
   * be said. Null leaves the sentence at the dollars alone.
   */
  entryPx?: number | null
  liquidation: boolean
  walletLabel: string
  practice: boolean
}): { title: string; body: string; level: TradeNoticeLevel } {
  const coin = marketSymbol(fill.marketKey)
  const usd = formatUsdRounded(Math.abs(fill.px * fill.sz))
  const price = formatPrice(fill.px)
  const did = fillWasExit(fill) ? "Exited a trade" : "Entered a trade"
  const tag = walletTag(fill.walletLabel, fill.practice)

  if (fill.liquidation) {
    return {
      title: `The exchange liquidated ${coin}: exited ${usd} at ${price} ${tag}`,
      body:
        fill.closedPnl !== 0
          ? `${gainWords(fill.closedPnl, null)} The exchange closed this itself.`
          : "The exchange closed this itself.",
      level: "critical",
    }
  }

  const title = `${did}: ${usd} of ${coin} at ${price} ${tag}`
  if (fill.closedPnl !== 0) {
    return {
      title,
      body: gainWords(fill.closedPnl, fill.entryPx ?? null),
      level: fill.closedPnl < 0 ? "warning" : "info",
    }
  }
  return { title, body: "The order filled on the exchange.", level: "info" }
}

/**
 * The second notice, sent when a closing fill turns out to have come from a
 * stop or a target. Second on purpose: the fill fact arrives first and the
 * stop fact arrives later, and two honest notices beat one delayed one.
 */
export function triggerNoticeWords(input: {
  kind: "stop" | "target"
  marketKey: string
  side: "buy" | "sell"
  px: number
  closedPnl: number
  walletLabel: string
  practice: boolean
}): { title: string; body: string; level: TradeNoticeLevel } {
  const coin = marketSymbol(input.marketKey)
  const name = input.kind === "stop" ? "Stop hit" : "Target hit"
  const tag = walletTag(input.walletLabel, input.practice)
  const money =
    input.closedPnl !== 0
      ? `, ${input.closedPnl < 0 ? "lost" : "made"} ${formatUsdRounded(Math.abs(input.closedPnl))}`
      : ""
  return {
    title: `${name} on ${coin}: exited at ${formatPrice(input.px)}${money} ${tag}`,
    body:
      input.kind === "stop"
        ? "The stop order fired and closed the position."
        : "The target order fired and took the profit.",
    level: input.kind === "stop" && input.closedPnl < 0 ? "warning" : "info",
  }
}

/**
 * "Made $55 on this close." — and, when the entry is known, what the figure
 * was measured against.
 *
 * **Said because the exchange's figure and the last buy disagree.** On 2 Sep
 * 2026 a sale of 782 ENA at 0.15105, bought an hour earlier at 0.14737, rang
 * the bell with "Lost $3.81". Hyperliquid was right: the position also held
 * 1,734 coins bought near 0.16, and an exchange measures every close against
 * the whole position's average entry, never against one buy. The number
 * without the entry beside it read as a mistake, so the entry is named.
 */
function gainWords(closedPnl: number, entryPx: number | null): string {
  const money = `${closedPnl < 0 ? "Lost" : "Made"} ${formatUsdRounded(Math.abs(closedPnl))} on this close.`
  if (entryPx === null) return money
  return `${money} That is measured against the whole position's average entry of ${formatPrice(entryPx)}, not the last buy.`
}
