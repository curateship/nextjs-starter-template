import { marketSymbol, type CandleInterval } from "@/lib/protocols/contracts"
import { DRAWING_VOLUME_LOOKBACK } from "@/lib/trade/drawings"
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

/**
 * What kind of thing happened, which is what the bell sorts its tabs by and
 * draws its tile from.
 *
 * Not the same question as the level. "A trade lost money" is a level; "a
 * trade happened at all" is a kind, and the bell needs both — the tab comes
 * from the kind, the colour from the level.
 */
export type TradeNoticeKind =
  | "entered"
  | "exited"
  | "liquidated"
  | "alert"
  | "system"

/**
 * One notice, in the two shapes the app needs it in.
 *
 * `title` and `body` are the whole sentences, saved on the notification row
 * itself and read by the admin table, the home activity card and anything else
 * that shows a notice as prose.
 *
 * `headline` and `meta` are the same event cut into the pieces the bell draws:
 * a short heading, then one fact per piece under it. "Entered $49.91 of CHIP"
 * above "@ 0.04932 · Main wallet · filled" is the same information as the
 * sentence, arranged so a column of twenty rows can be read straight down with
 * the price always in the same place. Tyler asked for this on 4 October 2026.
 */
export type TradeNoticeWords = {
  title: string
  body: string
  level: TradeNoticeLevel
  headline: string
  meta: string[]
  kind: TradeNoticeKind
}

/** One price alert, using the direction fixed when the line was placed. */
export function priceAlertNoticeWords(input: {
  marketKey: string
  price: number
  direction: "above" | "below"
}): TradeNoticeWords {
  const coin = marketSymbol(input.marketKey)
  const movement = input.direction === "above" ? "rising" : "falling"
  return {
    title: `${coin} reached ${formatPrice(input.price)} (was ${movement})`,
    body: "The price alert fired once and is now retired.",
    level: "info",
    headline: `${coin} reached ${formatPrice(input.price)}`,
    meta: [`@ ${formatPrice(input.price)}`, movement, "price alert"],
    kind: "alert",
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
  retest?: boolean
  marketKey: string
  kind: "level" | "trendline"
  /** Where the line was at the moment of the cross. */
  price: number
  direction: "above" | "below"
  name?: string | null
  /** How far past the line the price had to go, as a percentage. */
  buffer?: number | null
  /** The timeframe whose finished candle had to close past it, or null. */
  closeInterval?: CandleInterval | null
  /** The volume the breaking candle had to beat, as a multiple, or null. */
  volumeMultiple?: number | null
}): TradeNoticeWords {
  const coin = marketSymbol(input.marketKey)
  const movement = input.direction === "above" ? "rising" : "falling"
  // Said before the rest, because it explains the price in the line above it:
  // the price went further than the number in the title.
  // Printed as it was typed rather than through a formatter, so 0.1 reads as
  // "0.1%" and not "0.10%".
  const past = input.buffer
    ? `The price had to go ${input.buffer}% past the ${input.kind}. `
    : ""
  // What the candle had to do, in the order it was asked for: close on the
  // far side, and carry the volume. A Touch alert says neither.
  const closed = input.closeInterval
    ? `A finished ${input.closeInterval} candle closed ${input.direction} it. `
    : ""
  const volume = input.volumeMultiple
    ? `Its volume was at least ${input.volumeMultiple}x the average of the ${DRAWING_VOLUME_LOOKBACK} candles before it. `
    : ""
  const returned = input.retest ? `The price broke ${input.direction} the ${input.kind}, then returned to it from that side. ` : ""
  const verb = input.retest ? "retested" : "crossed"
  const rest = `${returned}${closed}${volume}${past}The ${input.kind}'s alert fired once and is now off. The ${input.kind} is still on the chart.`
  // One fact each, in the order somebody checks them: where the price was,
  // which way it was going, and what the line asked for before it would fire.
  const meta = [`@ ${formatPrice(input.price)}`, movement]
  if (input.buffer) meta.push(`${input.buffer}% buffer`)
  if (input.closeInterval) meta.push(`${input.closeInterval} close`)
  if (input.volumeMultiple) meta.push(`${input.volumeMultiple}x volume`)
  if (input.retest) meta.push("retest")

  if (input.name) {
    return {
      title: `${coin} ${verb} ${input.name} (was ${movement})`,
      body: `${input.name} was at ${formatPrice(input.price)}. ${rest}`,
      level: "info",
      headline: `${coin} ${verb} ${input.name}`,
      meta,
      kind: "alert",
    }
  }
  return {
    title: `${coin} ${verb} your ${input.kind} at ${formatPrice(input.price)} (was ${movement})`,
    body: rest,
    level: "info",
    headline: `${coin} ${verb} your ${input.kind}`,
    meta,
    kind: "alert",
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
  /**
   * The grid sale this fill belongs to, priced on the coins each level really
   * sold, when a grid sold this. Wins over the exchange's figure and its
   * average. See `gridRoundTrips`.
   */
  ownRung?: GridSaleMoney | null

  /**
   * What the whole grid run made after fees, when this sale left no coins.
   * Wins over `ownRung`. See `runEndedWords`.
   */
  runMoney?: number | null
  liquidation: boolean
  walletLabel: string
  practice: boolean
}): TradeNoticeWords {
  const coin = marketSymbol(fill.marketKey)
  const usd = formatUsdRounded(Math.abs(fill.px * fill.sz))
  const price = formatPrice(fill.px)
  const exit = fillWasExit(fill)
  const did = exit ? "Exited a trade" : "Entered a trade"
  const tag = walletTag(fill.walletLabel, fill.practice)
  // The wallet's own name, without the brackets the sentence needs. The bell
  // puts it in its own slot, where brackets inside brackets read as a mistake.
  const wallet = fill.practice
    ? `${fill.walletLabel}, practice`
    : fill.walletLabel

  if (fill.liquidation) {
    return {
      title: `The exchange liquidated ${coin}: exited ${usd} at ${price} ${tag}`,
      body:
        fill.closedPnl !== 0
          ? `${gainWords(fill.closedPnl, null)} The exchange closed this itself.`
          : "The exchange closed this itself.",
      level: "critical",
      headline: `The exchange liquidated ${usd} of ${coin}`,
      meta: [`@ ${price}`, wallet, moneyMeta(fill.closedPnl) ?? "liquidated"],
      kind: "liquidated",
    }
  }

  if (fill.runMoney !== undefined && fill.runMoney !== null) {
    return runEndedWords({
      coin,
      usd,
      price,
      tag,
      wallet,
      side: fill.side,
      money: fill.runMoney,
    })
  }
  const title = `${did}: ${usd} of ${coin} at ${price} ${tag}`
  // "Entered $49.91 of CHIP" — the word "a trade" is in the sentence below
  // because the sentence has room for it, and out of the heading because the
  // heading has to fit on one line beside the time.
  const headline = `${exit ? "Exited" : "Entered"} ${usd} of ${coin}`
  if (fill.ownRung) {
    return gridSaleWords({ coin, tag, wallet, sale: fill.ownRung })
  }
  if (fill.closedPnl !== 0) {
    return {
      title,
      body: gainWords(fill.closedPnl, fill.entryPx ?? null),
      level: fill.closedPnl < 0 ? "warning" : "info",
      headline,
      meta: [`@ ${price}`, wallet, moneyMeta(fill.closedPnl) ?? "filled"],
      kind: exit ? "exited" : "entered",
    }
  }
  return {
    title,
    body: "The order filled on the exchange.",
    level: "info",
    headline,
    meta: [`@ ${price}`, wallet, "filled"],
    kind: exit ? "exited" : "entered",
  }
}

/** "made $8.12" or "lost $13.02", or nothing at all when it broke even. */
function moneyMeta(closedPnl: number): string | null {
  if (closedPnl === 0) return null
  return `${closedPnl < 0 ? "lost" : "made"} ${formatUsdRounded(Math.abs(closedPnl))}`
}

/** One short notice for several entry rungs filled by one ladder. */
export function ladderFillNoticeWords(input: {
  marketKey: string
  count: number
  dollars: number
  walletLabel: string
  practice: boolean
}): TradeNoticeWords {
  const coin = marketSymbol(input.marketKey)
  const rungWord = input.count === 1 ? "rung" : "rungs"
  const wallet = input.practice
    ? `${input.walletLabel}, practice`
    : input.walletLabel
  return {
    title: `${coin} ladder filled ${input.count} ${rungWord}`,
    body: `${formatUsdRounded(input.dollars)} in. ${walletTag(input.walletLabel, input.practice)}`,
    level: "info",
    headline: `${coin} ladder filled ${input.count} ${rungWord}`,
    meta: [`${formatUsdRounded(input.dollars)} in`, wallet],
    kind: "entered",
  }
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
}): TradeNoticeWords {
  const coin = marketSymbol(input.marketKey)
  const name = input.kind === "stop" ? "Stop hit" : "Target hit"
  const tag = walletTag(input.walletLabel, input.practice)
  const wallet = input.practice
    ? `${input.walletLabel}, practice`
    : input.walletLabel
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
    headline: `${name} on ${coin}`,
    meta: [
      `@ ${formatPrice(input.px)}`,
      wallet,
      moneyMeta(input.closedPnl) ?? "closed",
    ],
    kind: "exited",
  }
}

/**
 * One grid sale, with the Pair Out rescue sold beside it when there was one.
 *
 * **A level's sale and its rescue are one thing that happened.** They go out
 * on the same pass at the same price, the profit of the first pays for the
 * second, and the bell used to ring twice with two unrelated-looking figures.
 * Tyler, 3 October 2026: "It shouldnt show 2 orders."
 */
export type GridSaleMoney = {
  /**
   * Each order in the event, the level's own sale first and anything its
   * profit cleared after it.
   */
  halves: readonly {
    /** "Rung 4", or "Rung 6 - level 2" once a level has been born below it. */
    name: string
    /** After both fees, the same figure the chart arrow shows. */
    money: number
    /** What this half sold for. */
    dollars: number
  }[]
  /** The halves added up. The only figure that describes the whole event. */
  money: number
  /** Which way the grid ran: a selling grid's level buys back, it does not sell. */
  direction: "long" | "short"
  /**
   * The one event both orders belong to, or null for a sale nothing was paired
   * with. The bell rings once per event, so this is what its inbox row is
   * named after.
   */
  eventId: string | null
  /**
   * What the position still holds after it, in dollars, or null when the
   * fills on hand cannot say.
   */
  holdingUsd: number | null
  /**
   * The coins this money covers, and what they went at.
   *
   * **Only the run-ended headline still prints these**, since an ordinary
   * grid sale now leads with its rung rather than its dollars. They are the
   * coins the money was worked out on, not the totals read a moment later: an
   * exchange hands one sale over in pieces, and a body worked out from three
   * of them under a headline counting four is one notice saying two things. On
   * 29 Sep 2026 a USELESS sale read "$262 … made $8.12" when the 1,086 coins in
   * that headline had made $10.81 and the $8.12 was 815 of them.
   */
  sz: number
  px: number
}

/**
 * "MARSCOIN Rung 4 sold and cleared Rung 6 - level 2: lost $13.02".
 *
 * **The rung leads, not the dollars sold.** Tyler's rule, 3 October 2026:
 * "showing the dollar amount sold tell us nothing about what was sold". The
 * dollars move to the second line, where they say which half is which, and
 * coin counts are gone from both lines: "I dont need to know how many coins it
 * bought. Replace that with the amount."
 *
 * **A grid sale is never measured against the position's average.** Tyler's
 * rule, 22 Sep 2026. On 22 Sep an ANSEM grid sale rang the bell with "Made
 * $1.81 … against the whole position's average entry", the venue's figure,
 * while the rungs still holding held that average up. Each level buys its own
 * coins and sells those same coins, so its own buy is the only honest
 * "before".
 */
function gridSaleWords(input: {
  coin: string
  tag: string
  /** The wallet's own name, for the bell's own slot. */
  wallet: string
  sale: GridSaleMoney
}): TradeNoticeWords {
  const { sale } = input
  const verb = sale.direction === "long" ? "sold" : "bought back"
  const [own, ...cleared] = sale.halves
  const result = `${sale.money < 0 ? "lost" : "made"} ${formatUsdRounded(Math.abs(sale.money))}`
  const did =
    cleared.length === 0
      ? `${own.name} ${verb}`
      : `${own.name} ${verb} and cleared ${cleared.map((half) => half.name).join(", ")}`
  const held =
    sale.holdingUsd === null
      ? ""
      : ` Still holding ${formatUsdRounded(sale.holdingUsd)}.`
  const body =
    cleared.length === 0
      ? `${upperFirst(verb)} ${formatUsdRounded(own.dollars)}.${held}`
      : sale.halves
          .map(
            (half) =>
              `${upperFirst(half.name)} ${verb} ${formatUsdRounded(half.dollars)} and ${
                half.money < 0 ? "lost" : "made"
              } ${formatUsdRounded(Math.abs(half.money))}.`
          )
          .join(" ")
  return {
    title: `${input.coin} ${did}: ${result} ${input.tag}`,
    body,
    level: sale.money < 0 ? "warning" : "info",
    headline: `${input.coin} ${did}`,
    meta: [`@ ${formatPrice(sale.px)}`, input.wallet, result],
    // A grid level selling is getting out of that level's own trade, whichever
    // way the grid runs: a buying grid sells its coins, a selling grid buys
    // them back, and both bank the money the level was opened for.
    kind: "exited",
  }
}

/** "rung 4" as it starts a sentence. */
function upperFirst(words: string): string {
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * "USELESS grid run ended: lost $16.43" — the sale that left no coins.
 *
 * **The last sale says the whole run, not itself.** Tyler's rule, 24 Sep
 * 2026. On 24 Sep a USELESS grid was closed and the bell said "Lost $87.36 on
 * this close", measured against the rungs still holding, the dearest ones.
 * The Positions row had said about -$20 a moment before, and the Journal row
 * for the same run said -$16.43: three figures for one close. The run's total
 * is the one number every way of counting agrees on, and it is the Journal
 * row's, so the bell says that.
 */
function runEndedWords(input: {
  coin: string
  usd: string
  price: string
  tag: string
  wallet: string
  /** A selling grid ends on a buy-back, so a buy is the last word. */
  side: "buy" | "sell"
  money: number
}): TradeNoticeWords {
  const result = `${input.money < 0 ? "lost" : "made"} ${formatUsdRounded(Math.abs(input.money))}`
  const last = input.side === "buy" ? "Bought back the last" : "Sold the last"
  return {
    title: `${input.coin} grid run ended: ${result} ${input.tag}`,
    body: `${last} ${input.usd} at ${input.price}. That is the whole run, after fees, the same as its Journal row.`,
    level: input.money < 0 ? "warning" : "info",
    headline: `${input.coin} grid run ended`,
    meta: [`@ ${input.price}`, input.wallet, result],
    kind: "exited",
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
