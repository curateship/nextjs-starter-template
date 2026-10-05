/**
 * How worth commenting on a post is.
 *
 * Reddit's own search answers "which posts match these words". That is not the
 * same question as "where would a comment of mine actually be read", and the
 * difference is the whole point of this screen.
 *
 * **What the first version got wrong, and how.** It multiplied the post's
 * upvotes in, on the reasoning that a post people are reading is worth
 * answering. Run against "reddit marketing tool" on 5 Oct 2026 it put a horror
 * story from r/nosleep at the top (314 upvotes, 28 replies, score 1.02) and the
 * two posts genuinely worth answering tenth and eleventh: r/SaaS "Thinking
 * about building a tool that shows which Reddit threads..." with 3 upvotes and
 * 5 replies, and r/SocialMediaMarketing "Reddit for marketers, by the numbers"
 * with 1 upvote and 1 reply, both at 0.15.
 *
 * Upvotes measure how big and busy a subreddit is far more than how relevant a
 * post is to you, so they are not in the score at all now. Three things are:
 *
 * - **Where Reddit put it.** Reddit returned the posts in its own relevance
 *   order, and that order is the only measure of relevance in the app.
 * - **Still quiet.** Few replies means a comment sits near the top rather than
 *   collapsed under "load more comments".
 * - **Still fresh.** People read a thread for a day or so and then stop. A
 *   comment on a week-old post is written for nobody.
 *
 *     rank = relevance * freshness * room * 10
 *
 * The 10 is only so the column reads as 6.1 rather than 0.61.
 */

/** How much of its score a post keeps as it ages. */
const FRESHNESS_BANDS: Array<{ withinHours: number; weight: number }> = [
  // Posted in the last six hours: the thread is live and being read now.
  { withinHours: 6, weight: 1 },
  // Today: still on people's front pages, still collecting replies.
  { withinHours: 24, weight: 0.6 },
  // This week: readable, but the conversation has mostly happened.
  { withinHours: 72, weight: 0.3 },
]

/** Anything older than the last band. Not zero, because old posts still rank. */
const STALE_WEIGHT = 0.1

/**
 * A post with no time on it. Reddit normally says, and when it does not, the
 * post is treated as old rather than fresh: guessing "fresh" would put an
 * unknown post at the top of the list on no evidence at all.
 */
const UNKNOWN_AGE_WEIGHT = STALE_WEIGHT

/**
 * How fast being further down Reddit's list costs a post.
 *
 * At 0.1, first place keeps all of its relevance, tenth keeps half, and
 * twenty-fifth keeps about a quarter. Gentle on purpose: Reddit's order is a
 * hint, not a verdict, and a quiet post in fifteenth place should still be able
 * to beat a buried one in second.
 */
const POSITION_DECAY = 0.1

/**
 * How fast replies cost a post.
 *
 * The +3 stops the very first reply from halving the score of whatever got
 * there first, which made the order jump around for no real reason. At 3
 * replies a post keeps half its room; at 27 it keeps a tenth.
 */
const REPLY_FLOOR = 3

export type RankInput = {
  /** Where Reddit put it in its own relevance order, 0 being first. */
  position: number
  commentCount: number
  /** When Reddit says it was posted, or null when Reddit did not say. */
  postedAt: Date | null
}

export function freshnessWeight(postedAt: Date | null, now: Date): number {
  if (!postedAt) return UNKNOWN_AGE_WEIGHT

  const hours = (now.getTime() - postedAt.getTime()) / 3_600_000
  // A post dated in the future is Reddit or a clock being wrong, not a scoop.
  // Treating it as brand new would park it at the top of the list forever.
  if (hours < 0) return UNKNOWN_AGE_WEIGHT

  for (const band of FRESHNESS_BANDS) {
    if (hours < band.withinHours) return band.weight
  }
  return STALE_WEIGHT
}

/** How much relevance a post keeps, given where Reddit listed it. */
export function relevanceWeight(position: number): number {
  const place = Number.isFinite(position) ? Math.max(0, Math.round(position)) : 0
  return 1 / (1 + POSITION_DECAY * place)
}

/** How much room a comment has, given how many replies are already there. */
export function replyRoomWeight(commentCount: number): number {
  const replies = Number.isFinite(commentCount) ? Math.max(0, commentCount) : 0
  return REPLY_FLOOR / (replies + REPLY_FLOOR)
}

/**
 * The score, rounded to four places because that is what the column stores.
 *
 * Two worked examples, which are also the test:
 *
 * - Reddit's fourth result, posted today, 5 replies:
 *   `1/1.3 * 0.6 * 3/8 * 10` is **1.7308**.
 * - Reddit's second result, three weeks old, 400 replies:
 *   `1/1.1 * 0.1 * 3/403 * 10` is **0.0068**.
 *
 * The fresh quiet post ranks 255 times higher than the old buried one, even
 * though the buried one matched the words better.
 */
export function rankFind(input: RankInput, now: Date = new Date()): number {
  const raw =
    relevanceWeight(input.position) *
    freshnessWeight(input.postedAt, now) *
    replyRoomWeight(input.commentCount) *
    10
  return Math.round(raw * 10_000) / 10_000
}

/**
 * The three bands the list is grouped under.
 *
 * A score is a sort order, not something to read: 2.0 on no scale tells a
 * person nothing, which is what Tyler said when he asked what the column meant.
 * These are the same order said in words, and the list groups under them.
 *
 * The two thresholds were picked against a real run of "reddit marketing tool"
 * on 5 Oct 2026, which returned 15 posts scoring 2.00 down to 0.13. At 1.0 and
 * 0.3 that run split 3 strong, 7 possible and 5 low, and reading the three
 * groups they are the right three: the strong ones are all today with one or
 * two replies, and the low ones are a Tesla story with 135 replies and a horror
 * story with 28.
 */
const STRONG_FIT_FROM = 1
const POSSIBLE_FIT_FROM = 0.3

export type FitBand = "strong" | "possible" | "low"

export const FIT_BANDS: readonly FitBand[] = ["strong", "possible", "low"]

/** What each band is called on screen. */
export const FIT_BAND_LABELS: Record<FitBand, string> = {
  strong: "Strong fit",
  possible: "Possible",
  low: "Low fit",
}

export function fitBand(rank: number): FitBand {
  if (!Number.isFinite(rank)) return "low"
  if (rank >= STRONG_FIT_FROM) return "strong"
  if (rank >= POSSIBLE_FIT_FROM) return "possible"
  return "low"
}

/** Plain words for why a post is near the top, for the row's tooltip. */
export function rankReason(input: RankInput, now: Date = new Date()): string {
  const weight = freshnessWeight(input.postedAt, now)
  const age = !input.postedAt
    ? "no posting time"
    : weight === 1
      ? "posted in the last few hours"
      : weight === 0.6
        ? "posted today"
        : weight === 0.3
          ? "posted this week"
          : "older than a week"

  const room =
    input.commentCount === 0
      ? "no replies yet"
      : input.commentCount <= 10
        ? `only ${input.commentCount} replies`
        : `${input.commentCount} replies already`

  const place =
    input.position === 0
      ? "Reddit's best match"
      : `Reddit's match ${input.position + 1}`

  return `${place}, ${age}, ${room}`
}
