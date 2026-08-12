import type { PaperSide } from "@/lib/trade/paper"

/**
 * Finished trades, practice and real alike, built out of fills.
 *
 * **A trade is flat to flat.** It starts when a wallet goes from holding
 * nothing in a market to holding something, and it ends when it is back to
 * holding nothing. Everything in between — adding twice, taking half off,
 * being stopped out of the rest — is one trade, because that is what it was.
 *
 * This is deliberately NOT `pairTrades` from the backtest side. That one pairs
 * the oldest buy against the first sell and only ever goes long, which is
 * exactly right for a ladder and wrong here: real money can be short, and a
 * position added to twice would come back as three separate trades that each
 * claim their own entry.
 *
 * Nothing here talks to a database or a clock. It is handed rows and gives
 * back trades, so it can be checked line by line against a real account.
 */

/** Which of the two protections a waiting trigger order is. */
export type LiveTriggerKind = "stop" | "target"

/**
 * What is written down about an order once it has been looked into: one of
 * the two protections, or "none" — which is a real answer worth keeping, so
 * the exchange is never asked the same question twice.
 */
export type LiveTriggerRecord = LiveTriggerKind | "none"

/** One fill, as this app keeps it. */
export type LiveFill = {
  fillId: string
  /** The order it came from — how a stop is later told from an ordinary sell. */
  orderId: string
  walletId: string
  marketKey: string
  side: PaperSide
  px: number
  sz: number
  /** Epoch ms, the exchange's clock. */
  at: number
  /** What it banked, the exchange's own figure. Zero on a fill that opened. */
  closedPnl: number
  fee: number
  /** The venue's own words: "Close Long", "Open Short", "Long > Short", … */
  dir: string
  liquidation: boolean
  /**
   * Why this fill happened, where the fill itself already knows.
   *
   * The practice engine fires its own stops, so it writes down which level was
   * hit and there is nothing to look up. Real fills leave this null: the
   * exchange reports a stop as an ordinary sell, and the reason has to be
   * found through the order behind it.
   */
  ending?: LiveTradeEnding | null
  /** A real fill rather than a practice one, for the badge on the row. */
  live?: boolean
}

/** What ended a trade. */
export type LiveTradeEnding = "stop" | "target" | "liquidated" | "closed"

const ENDING_LABELS: Record<LiveTradeEnding, string> = {
  stop: "Stopped out",
  target: "Took profit",
  liquidated: "Liquidated",
  closed: "Closed",
}

/**
 * How a trade's ending reads, in the words that fit what actually happened.
 *
 * **A stop that fired in profit is a different animal.** One stop cut a loss;
 * the other followed the price up and banked a winner, and reading a column of
 * "Stopped out" gives you no way to tell which is which. So a stop that closed
 * above what the trade paid says "Trailing stopped out".
 *
 * That is read off the money, not off the order. The exchange has no trailing
 * stop of its own — a stop that follows a price is a stop somebody replaced at
 * a better price, and by the time this is read the earlier ones are gone. What
 * can be said for certain is that the stop fired on the winning side of the
 * entry, and that is the thing worth saying.
 */
export function tradeEndingLabel(trade: {
  ending: LiveTradeEnding
  pnl: number
}): string {
  if (trade.ending === "stop" && trade.pnl > 0) return "Trailing stopped out"
  return ENDING_LABELS[trade.ending]
}

export type LiveTrade = {
  /** Stable across polls: the wallet, the market and the opening fill. */
  id: string
  walletId: string
  marketKey: string
  /** Real money rather than practice. */
  live: boolean
  /** Which way it was held. */
  direction: "long" | "short"
  openedAt: number
  closedAt: number
  /** How long it ran, in milliseconds. */
  heldMs: number
  /** Size-weighted average of the way in, and of the way out. */
  entryPx: number
  exitPx: number
  /** How much of the market it held at its largest. */
  sz: number
  /** Dollars put in at the entry price. */
  amountUsd: number
  /** Made or lost, the exchange's figure less what it charged. */
  pnl: number
  returnPct: number
  ending: LiveTradeEnding
  /** Where the stop was set, when a stop is what ended it. */
  stopPx: number | null
  /** Every fill it was made of, oldest first — what the chart draws. */
  fills: LiveFill[]
}

/** Sizes below this are the exchange's rounding dust, not a position. */
const DUST = 1e-9

type Building = {
  direction: "long" | "short"
  fills: LiveFill[]
  openSz: number
  openCost: number
  closeSz: number
  closeCost: number
  pnl: number
}

/**
 * Every finished trade in the rows given, newest first.
 *
 * Trades still open are left out rather than shown with a blank ending — a
 * position you are still in is on the Positions tab, where it can be acted on.
 *
 * `triggers` maps an exchange order id to the protection it was, which is the
 * only way to know a sell was a stop: the exchange reports a stop firing as an
 * ordinary sell, and by the time anybody reads this the order itself is gone.
 */
export function buildLiveTrades(
  fills: readonly LiveFill[],
  triggers: ReadonlyMap<string, { kind: LiveTriggerKind; px: number | null }>
): LiveTrade[] {
  const byMarket = new Map<string, LiveFill[]>()
  for (const fill of fills) {
    if (fill.sz <= DUST) continue
    const key = `${fill.walletId} ${fill.marketKey}`
    const list = byMarket.get(key)
    if (list) list.push(fill)
    else byMarket.set(key, [fill])
  }

  const trades: LiveTrade[] = []
  for (const list of byMarket.values()) {
    // Oldest first, and the fill id breaks a tie so two fills stamped the same
    // millisecond come out in the same order every time this runs.
    const ordered = [...list].sort(
      (left, right) =>
        left.at - right.at || left.fillId.localeCompare(right.fillId)
    )

    let held = 0
    let building: Building | null = null

    for (const fill of ordered) {
      let signed = fill.side === "buy" ? fill.sz : -fill.sz

      // A single fill can finish one trade and start the opposite one — the
      // exchange calls that "Long > Short" and sends it as one row. It is
      // split by size so each half carries its share of the money and the fee,
      // rather than the whole lot landing on whichever trade happens to be
      // holding the row.
      while (Math.abs(signed) > DUST) {
        if (building === null) {
          // Nothing is held and this fill only closes: it belongs to a
          // position that was already running before our records start.
          // Counted as an opening trade it would come out backwards, so it is
          // left out and the Journal simply starts at the next whole trade.
          if (fill.dir.startsWith("Close")) break
          building = {
            direction: signed > 0 ? "long" : "short",
            fills: [],
            openSz: 0,
            openCost: 0,
            closeSz: 0,
            closeCost: 0,
            pnl: 0,
          }
          held = 0
        }

        const opening = building.direction === "long" ? signed > 0 : signed < 0
        // How much of this fill belongs to the trade being built: all of it,
        // unless it would take the position past flat and out the other side.
        const room = opening ? Math.abs(signed) : Math.abs(held)
        const part = Math.min(Math.abs(signed), room)
        const share = fill.sz > 0 ? part / fill.sz : 0

        const piece: LiveFill = {
          ...fill,
          sz: part,
          // The money belongs to the half that CLOSED. A flip is one row that
          // shuts a long and opens a short, and everything it banked was made
          // by the long — sharing it by size would hand the new short a profit
          // it has not made yet. A fill can only cross flat once, so the
          // closing half is never in doubt. The fee is different: the venue
          // charged it on the whole row, so it is shared by size.
          closedPnl: opening ? 0 : fill.closedPnl,
          fee: fill.fee * share,
        }
        building.fills.push(piece)
        building.pnl += piece.closedPnl - piece.fee
        if (opening) {
          building.openSz += part
          building.openCost += part * fill.px
        } else {
          building.closeSz += part
          building.closeCost += part * fill.px
        }

        held += signed > 0 ? part : -part
        signed += signed > 0 ? -part : part

        if (Math.abs(held) <= DUST) {
          trades.push(finish(building, triggers))
          building = null
        }
      }
    }
  }

  return trades.sort((left, right) => right.closedAt - left.closedAt)
}

function finish(
  building: Building,
  triggers: ReadonlyMap<string, { kind: LiveTriggerKind; px: number | null }>
): LiveTrade {
  const first = building.fills[0]
  const last = building.fills[building.fills.length - 1]
  const entryPx = building.openSz > 0 ? building.openCost / building.openSz : 0
  const exitPx = building.closeSz > 0 ? building.closeCost / building.closeSz : 0
  const amountUsd = entryPx * building.openSz

  // What the LAST fill was, because that is what ended it. A trade half closed
  // by hand and then stopped out of was, in the end, stopped out.
  const trigger = triggers.get(last.orderId) ?? null
  // A fill that already knows why it happened is believed over anything else:
  // the practice engine fired its own stop and wrote it down at the time.
  const ending: LiveTradeEnding = last.liquidation
    ? "liquidated"
    : (last.ending ?? (trigger ? trigger.kind : "closed"))

  return {
    id: `${first.walletId}:${first.marketKey}:${first.fillId}`,
    walletId: first.walletId,
    marketKey: first.marketKey,
    live: first.live === true,
    direction: building.direction,
    openedAt: first.at,
    closedAt: last.at,
    heldMs: Math.max(0, last.at - first.at),
    entryPx,
    exitPx,
    sz: building.openSz,
    amountUsd,
    pnl: building.pnl,
    returnPct: amountUsd > 0 ? (building.pnl / amountUsd) * 100 : 0,
    ending,
    stopPx: ending === "stop" ? (trigger?.px ?? null) : null,
    fills: building.fills,
  }
}

/** One arrow on the chart: where it goes, and what it says when pointed at. */
export type LiveFillMark = {
  at: number
  px: number
  side: PaperSide
  sz: number
  label: string
  detail: string | null
}

/**
 * A trade's fills as arrows, with their words already worked out.
 *
 * The words belong here rather than in the chart layer for the same reason the
 * backtest's do: the chart's job is "where does this time and this price
 * land?", and it has never heard of a stop. Building the sentence here also
 * means it can be checked without rendering anything.
 *
 * **One order is one arrow**, even when the exchange filled it in pieces. An
 * order for 0.69 that eats two prices off the book comes back as a fill of
 * 0.05 and a fill of 0.64, a hundredth of a cent apart and at the same
 * millisecond. Drawn as two arrows they sit on top of each other, and pointing
 * at the stack picks whichever landed on top — so a sell that made $6.84 could
 * read "$0.50" purely by where the pointer was. There is one sell here as far
 * as anybody is concerned, so there is one arrow.
 */
export function tradeFillMarks(trade: LiveTrade): LiveFillMark[] {
  const grouped = groupFills(trade.fills)
  const last = grouped[grouped.length - 1]
  return grouped.map((fill) => {
    const opening =
      trade.direction === "long" ? fill.side === "buy" : fill.side === "sell"
    // The arrow that ends the trade says what the WHOLE trade made — the same
    // figure as its row in the table, fee on the way in included. Anything
    // else and the two disagree by the entry fee, and a penny of daylight
    // between the row and the chart is a reason to trust neither. An earlier
    // part-close still speaks only for itself, which is all it can say.
    const money =
      !opening && fill === last ? trade.pnl : fill.closedPnl - fill.fee
    const label = opening
      ? `${fill.side === "buy" ? "Bought" : "Sold short"} ${price$(fill.px)}`
      : `${fill.side === "buy" ? "Bought back" : "Sold"} ${price$(fill.px)} · ${
          money >= 0 ? "made" : "lost"
        } ${money$(Math.abs(money))}`
    const detail = opening
      ? `Size ${trimmed(fill.sz)}`
      : fill === last
        ? tradeEndingLabel(trade)
        : `Part closed · ${trimmed(fill.sz)}`
    return {
      at: fill.at,
      px: fill.px,
      side: fill.side,
      sz: fill.sz,
      label,
      detail,
    }
  })
}

/**
 * One order's pieces added back into one fill, at the price it averaged.
 *
 * Grouped on the order rather than the moment, because that is what "one
 * thing somebody did" means — and a resting order filled in two goes an hour
 * apart is genuinely two things, so the two must also be within a second of
 * each other.
 */
function groupFills(fills: readonly LiveFill[]): LiveFill[] {
  const out: LiveFill[] = []
  for (const fill of fills) {
    const open = out[out.length - 1]
    if (
      open &&
      open.orderId === fill.orderId &&
      open.side === fill.side &&
      Math.abs(open.at - fill.at) <= 1000
    ) {
      const sz = open.sz + fill.sz
      out[out.length - 1] = {
        ...open,
        // The average of the prices it actually got, weighted by size — the
        // one price a person would say the order filled at.
        px: sz > 0 ? (open.px * open.sz + fill.px * fill.sz) / sz : open.px,
        sz,
        closedPnl: open.closedPnl + fill.closedPnl,
        fee: open.fee + fill.fee,
        liquidation: open.liquidation || fill.liquidation,
      }
      continue
    }
    out.push({ ...fill })
  }
  return out
}

/** A price, with enough places to be exact on a coin worth a few cents. */
function price$(value: number): string {
  const places = value !== 0 && Math.abs(value) < 1 ? 6 : 2
  return `$${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: places,
  })}`
}

/**
 * Money made or lost, to the cent and no further. A price on a cheap coin
 * needs six places; dollars in your pocket never do, and "$0.495444" reads as
 * a broken number rather than a small one.
 */
function money$(value: number): string {
  return `$${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

/** A size without the trailing zeros nobody typed. */
function trimmed(value: number): string {
  return String(Number(value.toFixed(8)))
}

/**
 * How long a trade ran, in the words a person would use. Deliberately coarse:
 * "3h 12m" answers "was this a scalp or a swing", and seconds never do.
 */
export function formatHeld(ms: number): string {
  if (ms < 60_000) return `${Math.max(1, Math.round(ms / 1000))}s`
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return hours >= 10 ? `${hours}h` : `${hours}h ${minutes % 60}m`
  const days = Math.floor(hours / 24)
  return days >= 10 ? `${days}d` : `${days}d ${hours % 24}h`
}
