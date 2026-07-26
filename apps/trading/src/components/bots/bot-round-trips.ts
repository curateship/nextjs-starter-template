/**
 * The minimum a fill must carry to be paired into round trips. Bot fills
 * (`BotDetailResponse["trades"]`) satisfy it as they are; the trade journal
 * maps its stored wallet fills into the same shape, so one implementation
 * serves both instead of a second, drifting copy.
 */
export type RoundTripFill = {
  id: string
  market: string
  side: string
  px: string | number
  sz: string | number
  fee: string | number
  closed_pnl?: string | number | null
  /** Fill time as an ISO string or ms since epoch. */
  fill_time: string | number
}

/**
 * One completed (or still-open) position cycle reconstructed from a bot's
 * fills, shaped like a backtest trade so the bot workspace can show the same
 * trade list and chart focus the backtest dashboard has.
 */
export type BotRoundTrip = {
  /** 1-based, oldest trip first — matches the backtest numbering. */
  n: number
  /** Stable selection key: the trip's first fill id. */
  id: string
  side: "long" | "short"
  entryTime: number
  /** null while the cycle is still open. */
  exitTime: number | null
  /** Average entry price (entry notional / entry size). */
  entryPx: number
  /** Average exit price; null while open. */
  exitPx: number | null
  /** Entry notional in dollars, matching the backtest "Amount" column. */
  amount: number
  /**
   * Net P&L: realized minus every fee in the cycle. For an open trip this
   * adds the unrealized P&L at the mark, i.e. "this cycle if closed now".
   */
  pnl: number
  returnPct: number
  /** Running net P&L across CLOSED trips; NaN for the open trip. */
  cumPnl: number
  open: boolean
  /**
   * Signed size still held (positive long, negative short); 0 once closed.
   * Taken from the same position walk that pairs the trips, so it accounts for
   * partial scale-outs and for the remnant fills a truncated history skips.
   * Never re-derive this by summing fill sizes — that double-counts a fill
   * closing a position we never saw opened.
   */
  szi: number
}

const EPS = 1e-9

/** Bot fills carry an ISO timestamp, journal fills carry epoch milliseconds. */
export function fillTimeMs(value: string | number): number {
  return typeof value === "number" ? value : Date.parse(value)
}

type Draft = {
  id: string
  side: "long" | "short"
  entryTime: number
  entryQty: number
  entryNotional: number
  exitQty: number
  exitNotional: number
  fees: number
  realized: number
}

/**
 * Walks fills oldest → newest tracking the signed position; a trip opens when
 * the position leaves zero and closes when it returns. A flip fill (e.g. a
 * QQE stop-and-reverse sell that closes a long and opens a short) is split
 * pro-rata: the closing part ends one trip, the remainder starts the next.
 *
 * The fill history is capped server-side (200), so the oldest fills of a
 * truncated history can describe a position we never saw opened: a fill that
 * realizes P&L while our tracked position is flat is such a remnant and is
 * skipped rather than misread as a fresh entry.
 */
export function buildBotRoundTrips(
  trades: RoundTripFill[],
  markPrice: number
): BotRoundTrip[] {
  const fills = [...trades].sort(
    (a, b) => fillTimeMs(a.fill_time) - fillTimeMs(b.fill_time)
  )

  const trips: BotRoundTrip[] = []
  let draft: Draft | null = null
  let pos = 0
  let cumPnl = 0

  const close = (exitTime: number) => {
    if (!draft) return
    const pnl = draft.realized - draft.fees
    cumPnl += pnl
    trips.push({
      n: trips.length + 1,
      id: draft.id,
      side: draft.side,
      entryTime: draft.entryTime,
      exitTime,
      entryPx: draft.entryQty > EPS ? draft.entryNotional / draft.entryQty : 0,
      exitPx: draft.exitQty > EPS ? draft.exitNotional / draft.exitQty : null,
      amount: draft.entryNotional,
      pnl,
      returnPct: draft.entryNotional > EPS ? (pnl / draft.entryNotional) * 100 : 0,
      cumPnl,
      open: false,
      szi: 0,
    })
    draft = null
  }

  for (const fill of fills) {
    const qty = Number(fill.sz)
    const px = Number(fill.px)
    const fee = Number(fill.fee)
    const fillPnl = Number(fill.closed_pnl ?? 0)
    const dir = fill.side === "buy" ? 1 : -1
    const time = fillTimeMs(fill.fill_time)
    if (!(qty > EPS) || !(px > 0)) continue

    if (Math.abs(pos) < EPS) {
      // Flat. A fill that realizes P&L here closes unseen (truncated) history.
      if (fillPnl !== 0) continue
      draft = {
        id: fill.id,
        side: dir > 0 ? "long" : "short",
        entryTime: time,
        entryQty: qty,
        entryNotional: px * qty,
        exitQty: 0,
        exitNotional: 0,
        fees: fee,
        realized: 0,
      }
      pos = dir * qty
      continue
    }

    const sameDir = dir > 0 === pos > 0
    if (sameDir && draft) {
      // Scaling in (DCA safety orders, grid re-buys).
      draft.entryQty += qty
      draft.entryNotional += px * qty
      draft.fees += fee
      pos += dir * qty
      continue
    }

    // Reducing — possibly through zero into a flip.
    const reduce = Math.min(Math.abs(pos), qty)
    const remainder = qty - reduce
    const closeFrac = reduce / qty
    if (draft) {
      draft.fees += fee * closeFrac
      draft.realized += fillPnl
      draft.exitQty += reduce
      draft.exitNotional += px * reduce
    }
    pos += dir * reduce
    if (Math.abs(pos) < EPS) {
      pos = 0
      close(time)
    }
    if (remainder > EPS) {
      draft = {
        id: fill.id,
        side: dir > 0 ? "long" : "short",
        entryTime: time,
        entryQty: remainder,
        entryNotional: px * remainder,
        exitQty: 0,
        exitNotional: 0,
        fees: fee * (1 - closeFrac),
        realized: 0,
      }
      pos = dir * remainder
    }
  }

  if (draft) {
    // Still-open cycle: P&L is realized-so-far minus fees, plus unrealized at
    // the live mark when we have one.
    const open: Draft = draft
    const entryPx = open.entryQty > EPS ? open.entryNotional / open.entryQty : 0
    const unrealized = markPrice > 0 && entryPx > 0 ? (markPrice - entryPx) * pos : 0
    const pnl = open.realized - open.fees + unrealized
    trips.push({
      n: trips.length + 1,
      id: open.id,
      side: open.side,
      entryTime: open.entryTime,
      exitTime: null,
      entryPx,
      exitPx: null,
      amount: open.entryNotional,
      pnl,
      returnPct: open.entryNotional > EPS ? (pnl / open.entryNotional) * 100 : 0,
      cumPnl: NaN,
      open: true,
      szi: pos,
    })
  }

  return trips
}
