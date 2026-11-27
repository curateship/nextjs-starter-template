import { reachWeight } from "../medium/rank"

/**
 * How worth commenting on a LinkedIn post is (part 10, with the "names you"
 * lift from part 15 and the job-title lift from part 14).
 *
 * Copied in shape from X's ranking (`../x/rank.ts`), with LinkedIn's own
 * numbers:
 *
 * - **Freshness counts, but slower than on X.** A LinkedIn post keeps being
 *   shown for a day or two, and comments in its first hours are read most.
 *   After 2 days a post leaves To look at altogether (part 19, Tyler: "2
 *   days").
 * - **Room.** LinkedIn shows the first few comments and folds the rest, so a
 *   post with 60 comments has little room left.
 * - **The writer's reach** is Medium's: it grows with the number of digits
 *   of followers, so a writer with a million followers is not a thousand
 *   times more worth answering, and one nobody follows counts half.
 * - **Names you.** A post found by search words marked as the product's own
 *   name or a rival's counts double.
 * - **Who the writer is.** A writer whose job title matches one of the
 *   project's "who we sell to" titles counts 1.8 times: a comment under a
 *   founder's post is read by the founder.
 *
 *     rank = relevance * freshness * room * reach * named * buyer * 10
 *
 * A watched person's or page's post is listed above every searched one
 * whatever its rank (part 12, `listLinkedinFinds`).
 */

/** How much of its score a post keeps as it ages. */
const FRESHNESS_BANDS: Array<{ withinHours: number; weight: number }> = [
  { withinHours: 2, weight: 1 },
  { withinHours: 6, weight: 0.75 },
  { withinHours: 12, weight: 0.55 },
  { withinHours: 24, weight: 0.35 },
  { withinHours: 48, weight: 0.2 },
]

/** Older than the last band: it has left To look at, but still ranks in a search. */
const STALE_WEIGHT = 0.05

/** At 0.1, the first post keeps all its relevance and the tenth keeps half, as on Reddit and X. */
const POSITION_DECAY = 0.1

/** At 20 comments a post keeps half its room; at 60, a quarter. */
const COMMENT_FLOOR = 20

const NAMED_WEIGHT = 2

const BUYER_WEIGHT = 1.8

export type LinkedinRankInput = {
  position: number
  comments: number
  postedAt: Date | null
  /** Null when LinkedIn did not say. */
  authorFollowers: number | null
  named: boolean
  /** The project's buyer title the writer's headline matched, or "". */
  matchedTitle: string
  /** Posted by a person or page the project watches. */
  watched?: boolean
  /** Found in one of the accounts' own feeds. */
  fromFeed?: boolean
}

export function linkedinFreshnessWeight(postedAt: Date | null, now: Date): number {
  if (!postedAt) return STALE_WEIGHT
  const hours = (now.getTime() - postedAt.getTime()) / 3_600_000
  // A post dated in the future is a clock being wrong, not a scoop.
  if (hours < -0.1) return STALE_WEIGHT
  for (const band of FRESHNESS_BANDS) {
    if (hours < band.withinHours) return band.weight
  }
  return STALE_WEIGHT
}

export function linkedinRelevanceWeight(position: number): number {
  const place = Number.isFinite(position) ? Math.max(0, Math.round(position)) : 0
  return 1 / (1 + POSITION_DECAY * place)
}

export function linkedinRoomWeight(comments: number): number {
  const count = Number.isFinite(comments) ? Math.max(0, comments) : 0
  return COMMENT_FLOOR / (count + COMMENT_FLOOR)
}

/**
 * The score, rounded to four places because that is what the column stores.
 *
 * Worked example, which is also the test: the second post in a search,
 * posted 3 hours ago, 5 comments, by a founder with 10,000 followers when
 * the project sells to founders, not named:
 * `1/1.1 * 0.75 * 20/25 * 1.3 * 1 * 1.8 * 10` is **12.7637**, because the
 * reach for 10,000 followers is a hair over 1.3.
 */
export function rankLinkedinFind(input: LinkedinRankInput, now: Date = new Date()): number {
  const raw =
    linkedinRelevanceWeight(input.position) *
    linkedinFreshnessWeight(input.postedAt, now) *
    linkedinRoomWeight(input.comments) *
    reachWeight(input.authorFollowers) *
    (input.named ? NAMED_WEIGHT : 1) *
    (input.matchedTitle ? BUYER_WEIGHT : 1) *
    10
  return Math.round(raw * 10_000) / 10_000
}

/**
 * The bands the list is grouped under, the same words as the other
 * networks'. A typical find, half a day old with 15 comments by a writer
 * with 500 followers, scores about 2 (`1/1.5 * 0.55 * 20/35 * 1.04 * 10` is
 * 2.18), so a strong fit is a fresh post with room, or one by a buyer.
 */
export const LINKEDIN_STRONG_FIT_FROM = 5
const LINKEDIN_POSSIBLE_FIT_FROM = 1.5

export type LinkedinFitBand = "strong" | "possible" | "low"

export function linkedinFitBand(rank: number): LinkedinFitBand {
  if (!Number.isFinite(rank)) return "low"
  if (rank >= LINKEDIN_STRONG_FIT_FROM) return "strong"
  if (rank >= LINKEDIN_POSSIBLE_FIT_FROM) return "possible"
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
export function linkedinRankReason(input: LinkedinRankInput, now: Date = new Date()): string {
  const room = input.comments === 0 ? "no comments yet" : input.comments === 1 ? "1 comment" : `${input.comments} comments`
  const reach =
    input.authorFollowers === null
      ? "followers not known"
      : `writer has ${input.authorFollowers.toLocaleString("en-US")} ${input.authorFollowers === 1 ? "follower" : "followers"}`
  const place = input.fromFeed
    ? "From the account's own feed"
    : input.position === 0
      ? "First in the keyword's list"
      : `Number ${input.position + 1} in the keyword's list`
  return [
    input.watched ? "Someone you watch. " : "",
    input.named ? "Names you or a rival. " : "",
    input.matchedTitle ? `A ${input.matchedTitle}, someone you sell to. ` : "",
    `${place}, ${ageWords(input.postedAt, now)}, ${room}, ${reach}`,
  ].join("")
}
