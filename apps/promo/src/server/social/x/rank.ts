import { reachWeight } from "../medium/rank"

/**
 * How worth replying to an X post is (part 9, with the "names you" lift from
 * part 13).
 *
 * Copied in shape from Medium's ranking (`../medium/rank.ts`), with X's own
 * numbers:
 *
 * - **Freshness counts for most.** An X post is read in its first few hours
 *   and then sinks. A reply in the first hour sits near the top of the
 *   replies; one the next morning sits under a hundred others. After 12 hours
 *   a post leaves To look at altogether (part 18).
 * - **Room is crowded faster.** X folds all but the top replies behind "Show
 *   more replies", so the 30th reply is barely seen.
 * - **The poster's reach** is Medium's: it grows with the number of digits
 *   of followers, so a poster with a million followers is not a thousand
 *   times more worth answering, and one nobody follows counts half.
 * - **Names you.** A post found by search words marked as the product's own
 *   name or a rival's goes first.
 *
 *     rank = relevance * freshness * room * reach * named * 10
 *
 * A watched account's post is listed above every searched one whatever its
 * rank (part 11, `listXFinds`), since the point of watching is to reply in
 * the first minutes.
 */

/** How much of its score a post keeps as it ages. */
const FRESHNESS_BANDS: Array<{ withinHours: number; weight: number }> = [
  { withinHours: 1, weight: 1 },
  { withinHours: 3, weight: 0.7 },
  { withinHours: 6, weight: 0.45 },
  { withinHours: 12, weight: 0.25 },
]

/** Older than the last band: it has left To look at, but still ranks in a search. */
const STALE_WEIGHT = 0.05

/** At 0.1, the first post keeps all its relevance and the tenth keeps half, as on Reddit. */
const POSITION_DECAY = 0.1

/** At 15 replies a post keeps half its room; at 45, a quarter. */
const REPLY_FLOOR = 15

/** A post that names the product or a rival goes ahead of the same post found otherwise. */
const NAMED_WEIGHT = 2

export type XRankInput = {
  position: number
  replies: number
  postedAt: Date | null
  /** Null when X did not say. */
  authorFollowers: number | null
  named: boolean
  /** Posted by an account the project watches. */
  watched?: boolean
}

export function xFreshnessWeight(postedAt: Date | null, now: Date): number {
  if (!postedAt) return STALE_WEIGHT
  const hours = (now.getTime() - postedAt.getTime()) / 3_600_000
  // A post dated in the future is a clock being wrong, not a scoop.
  if (hours < -0.1) return STALE_WEIGHT
  for (const band of FRESHNESS_BANDS) {
    if (hours < band.withinHours) return band.weight
  }
  return STALE_WEIGHT
}

export function xRelevanceWeight(position: number): number {
  const place = Number.isFinite(position) ? Math.max(0, Math.round(position)) : 0
  return 1 / (1 + POSITION_DECAY * place)
}

export function xRoomWeight(replies: number): number {
  const count = Number.isFinite(replies) ? Math.max(0, replies) : 0
  return REPLY_FLOOR / (count + REPLY_FLOOR)
}

/**
 * The score, rounded to four places because that is what the column stores.
 *
 * Worked example, which is also the test: the second post in a search,
 * posted 2 hours ago, 5 replies, by an account with 10,000 followers, not
 * named: `1/1.1 * 0.7 * 15/20 * 1.3 * 1 * 10` is **6.2046**.
 */
export function rankXFind(input: XRankInput, now: Date = new Date()): number {
  const raw =
    xRelevanceWeight(input.position) *
    xFreshnessWeight(input.postedAt, now) *
    xRoomWeight(input.replies) *
    reachWeight(input.authorFollowers) *
    (input.named ? NAMED_WEIGHT : 1) *
    10
  return Math.round(raw * 10_000) / 10_000
}

/**
 * The bands the list is grouped under, the same words as Reddit's and
 * Medium's. A typical find, a few hours old with 10 replies by an account
 * with 500 followers, scores about 2 (`1/1.5 * 0.45 * 15/25 * 1.04 * 10` is
 * 1.87), so a strong fit is a fresh post with room.
 */
export const X_STRONG_FIT_FROM = 5
const X_POSSIBLE_FIT_FROM = 1.5

export type XFitBand = "strong" | "possible" | "low"

export function xFitBand(rank: number): XFitBand {
  if (!Number.isFinite(rank)) return "low"
  if (rank >= X_STRONG_FIT_FROM) return "strong"
  if (rank >= X_POSSIBLE_FIT_FROM) return "possible"
  return "low"
}

/** "20 minutes ago", "3 hours ago": how old a post is, in the words the reason uses. */
function ageWords(postedAt: Date | null, now: Date): string {
  if (!postedAt) return "no posting time"
  const minutes = Math.max(0, Math.round((now.getTime() - postedAt.getTime()) / 60_000))
  if (minutes < 60) return `posted ${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `posted ${hours} ${hours === 1 ? "hour" : "hours"} ago`
  return `posted ${Math.round(hours / 24)} days ago`
}

/** Plain words for why a post is where it is, for the row's tooltip. */
export function xRankReason(input: XRankInput, now: Date = new Date()): string {
  const room = input.replies === 0 ? "no replies yet" : input.replies === 1 ? "1 reply" : `${input.replies} replies`
  const reach =
    input.authorFollowers === null
      ? "followers not known"
      : `poster has ${input.authorFollowers.toLocaleString("en-US")} ${input.authorFollowers === 1 ? "follower" : "followers"}`
  const place = input.position === 0 ? "First in the keyword's list" : `Number ${input.position + 1} in the keyword's list`
  return `${input.watched ? "A watched account. " : ""}${input.named ? "Names you or a rival. " : ""}${place}, ${ageWords(input.postedAt, now)}, ${room}, ${reach}`
}
