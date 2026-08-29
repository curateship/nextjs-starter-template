import type { LiveFill } from "@/lib/trade/live-trades"
import type { TradePosition } from "@/lib/trade/paper"

/**
 * What a real position has cost in fees, added up by this app from the fills
 * it has been given.
 *
 * **It is this app's count, not the exchange's figure, and the words on screen
 * have to say so.** No venue reports "fees so far on this open position", and
 * `workspace/docs/screens/reading-the-figures.md` forbids printing a figure the exchange did not state as though it
 * had. What the exchange DOES report is every fill it charged us for, and this
 * adds those up. The difference matters: a fill the sweep has not brought in
 * yet is missing from the total, and the total then reads low.
 *
 * **A dash and a zero are different answers.** Zero means the venue charged
 * nothing, which happens on a maker rebate. Nothing swept means the question
 * has not been answered at all, and that is `null` here.
 *
 * **How far back it can see is part of the answer.** The count starts at the
 * oldest fill it can reach, and the fills on hand do not always go back to the
 * moment the position opened — KuCoin only answers for a day at a time, and
 * the panel holds the newest few thousand fills rather than an account's whole
 * history. So the walk checks its own work: the fills it counted have to add
 * up to the size the exchange says is held. When they do not, the count starts
 * mid-position and `whole` is false, which the screen says out loud rather
 * than printing a short number as though it were the whole thing.
 */
export type PositionFees = {
  /** Dollars charged over the fills counted. A rebate comes back negative. */
  paid: number
  /** The oldest fill counted, in epoch milliseconds. */
  countedFrom: number
  /** How many fills went into it. */
  countedFills: number
  /**
   * The counted fills add up to the position the exchange reports, so the
   * count covers its whole life. False means it starts part way in.
   */
  whole: boolean
}

/** Sizes below this are the exchange's rounding dust, not a position. */
const DUST = 1e-9

/**
 * The fees one open position has run up, walked back from the newest fill.
 *
 * Backwards, because the boundary being looked for is the moment the position
 * opened, and the exchange's own size is what marks it: keep taking fills off
 * the newest end until the sizes add up to what is held, and everything taken
 * belongs to this position's life. Walking forwards would need every fill the
 * coin has ever had before it could say where the last flat moment was.
 *
 * One fill can end a short and open a long in the same row — the venue calls
 * that "Long > Short" — so the boundary can fall inside a fill. Its fee is
 * then shared by size, the same way `buildLiveTrades` shares it, and only the
 * part belonging to this position is counted.
 *
 * Null when there is no open position or no fill for it, which the screen
 * draws as a dash.
 */
export function positionFees(
  fills: readonly LiveFill[],
  position: Pick<TradePosition, "walletId" | "marketKey" | "szi">
): PositionFees | null {
  if (Math.abs(position.szi) <= DUST) return null

  const mine = fills.filter(
    (fill) =>
      fill.walletId === position.walletId &&
      fill.marketKey === position.marketKey &&
      fill.sz > DUST
  )
  if (mine.length === 0) return null

  // Newest first, and the fill id breaks a tie so two fills stamped the same
  // millisecond come out in the same order every time this runs.
  const ordered = [...mine].sort(
    (left, right) =>
      right.at - left.at || right.fillId.localeCompare(left.fillId)
  )

  // Sizes carry as many decimals as the market allows, so the match has to be
  // relative. Absolute dust would never close on a coin priced in millionths.
  const tolerance = Math.max(DUST, Math.abs(position.szi) * 1e-6)
  let counted = 0
  let paid = 0
  let countedFills = 0
  let countedFrom = ordered[0].at
  let whole = false

  for (const fill of ordered) {
    const signed = fill.side === "buy" ? fill.sz : -fill.sz
    const missing = position.szi - counted
    // A fill pushing the total TOWARDS what is held may be needed only in
    // part: the rest of it belongs to whatever the position was before. One
    // going the other way is a part-close inside this position's life and
    // counts whole, which makes the fills before it larger, not smaller.
    const sameWay = missing > 0 === signed > 0
    const part = sameWay ? Math.min(fill.sz, Math.abs(missing)) : fill.sz

    paid += fill.fee * (part / fill.sz)
    counted += signed > 0 ? part : -part
    countedFills += 1
    countedFrom = fill.at

    if (Math.abs(position.szi - counted) <= tolerance) {
      whole = true
      break
    }
  }

  return { paid, countedFrom, countedFills, whole }
}
