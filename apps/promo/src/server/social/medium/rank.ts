/**
 * How worth responding to a Medium story is (part 6, with the writer's reach
 * from part 14 and the "names you" lift from part 13).
 *
 * Copied from Reddit's ranking (`../reddit/rank.ts`) rather than imported,
 * because two of its three numbers are wrong for Medium:
 *
 * - **Freshness lasts longer.** A Reddit thread is read for a day. A Medium
 *   story keeps being found through its tags and through search for weeks,
 *   so a response on a story from last week is still read.
 * - **Responses cost less.** Medium shows every response beside the story,
 *   with the most clapped first, so the tenth response is still on screen. A
 *   Reddit comment under 30 others is folded away.
 *
 * Two numbers are Medium's own:
 *
 * - **The writer's reach.** A story by a writer with 12,000 followers is
 *   read by more people than one by a writer with 12, and so is a response
 *   under it. It grows with the number of digits, so a writer with a million
 *   followers is not a thousand times more worth answering. A writer nobody
 *   follows counts half: a tag's feed is newest first, and measured on
 *   21 Oct 2026 against the tags toronto and food and the words "best
 *   restaurants in toronto", 14 of the 27 stories were by writers with 0
 *   followers, most of them pages selling food labels and bus hire. Counted
 *   at 1, 10 of those were Strong fit; counted at half, the 2 Strong fits
 *   were by writers with 181 and 1,942 followers.
 * - **Names you.** A story found by a keyword marked as the product's own
 *   name or a rival's is the conversation already happening, and goes first.
 *
 *     rank = relevance * freshness * room * reach * named * 10
 */

/** How much of its score a story keeps as it ages. */
const FRESHNESS_BANDS: Array<{ withinDays: number; weight: number }> = [
  { withinDays: 3, weight: 1 },
  { withinDays: 14, weight: 0.6 },
  { withinDays: 60, weight: 0.3 },
]

/** Older than the last band. Not zero, because an old story still ranks. */
const STALE_WEIGHT = 0.1

/** At 0.1, the first story keeps all its relevance and the tenth keeps half, as on Reddit. */
const POSITION_DECAY = 0.1

/** At 10 responses a story keeps half its room; at 30, a quarter. */
const RESPONSE_FLOOR = 10

/**
 * The writer's reach: 0.5 with no followers, then up by 0.2 for every digit,
 * so 100 followers is 0.9, 1,000 is 1.1, 10,000 is 1.3 and 1,000,000 is 1.7.
 * 1 when Medium did not say, which is neither good nor bad.
 */
const REACH_FLOOR = 0.5
const REACH_PER_DIGIT = 0.2
const REACH_CEILING = 1.9

/** A story that names the product or a rival goes ahead of the same story found otherwise. */
const NAMED_WEIGHT = 2

export type MediumRankInput = {
  position: number
  responseCount: number
  postedAt: Date | null
  /** Null when Medium did not say. */
  writerFollowers: number | null
  named: boolean
}

export function mediumFreshnessWeight(postedAt: Date | null, now: Date): number {
  if (!postedAt) return STALE_WEIGHT
  const days = (now.getTime() - postedAt.getTime()) / 86_400_000
  // A story dated in the future is a clock being wrong, not a scoop.
  if (days < 0) return STALE_WEIGHT
  for (const band of FRESHNESS_BANDS) {
    if (days < band.withinDays) return band.weight
  }
  return STALE_WEIGHT
}

export function mediumRelevanceWeight(position: number): number {
  const place = Number.isFinite(position) ? Math.max(0, Math.round(position)) : 0
  return 1 / (1 + POSITION_DECAY * place)
}

export function mediumRoomWeight(responseCount: number): number {
  const responses = Number.isFinite(responseCount) ? Math.max(0, responseCount) : 0
  return RESPONSE_FLOOR / (responses + RESPONSE_FLOOR)
}

export function reachWeight(followers: number | null): number {
  if (followers === null || !Number.isFinite(followers)) return 1
  return Math.min(REACH_CEILING, REACH_FLOOR + REACH_PER_DIGIT * Math.log10(Math.max(0, followers) + 1))
}

/**
 * The score, rounded to four places because that is what the column stores.
 *
 * Worked example, which is also the test: the third story on a tag, posted
 * two days ago, 4 responses, by a writer with 10,000 followers, not named:
 * `1/1.2 * 1 * 10/14 * 1.3 * 1 * 10` is **7.7381**.
 */
export function rankMediumFind(input: MediumRankInput, now: Date = new Date()): number {
  const raw =
    mediumRelevanceWeight(input.position) *
    mediumFreshnessWeight(input.postedAt, now) *
    mediumRoomWeight(input.responseCount) *
    reachWeight(input.writerFollowers) *
    (input.named ? NAMED_WEIGHT : 1) *
    10
  return Math.round(raw * 10_000) / 10_000
}

/**
 * The three bands the list is grouped under, the same words as Reddit's.
 * The thresholds are higher than Reddit's because a typical Medium story,
 * a week old with a few responses by a writer with 200 followers, scores
 * about 3 here (`1/1.5 * 0.6 * 10/13 * 0.96 * 10` is 2.95), so a strong fit
 * has to be clearly better than that.
 */
export const MEDIUM_STRONG_FIT_FROM = 6
const MEDIUM_POSSIBLE_FIT_FROM = 2

export type MediumFitBand = "strong" | "possible" | "low"

export function mediumFitBand(rank: number): MediumFitBand {
  if (!Number.isFinite(rank)) return "low"
  if (rank >= MEDIUM_STRONG_FIT_FROM) return "strong"
  if (rank >= MEDIUM_POSSIBLE_FIT_FROM) return "possible"
  return "low"
}

/** Plain words for why a story is where it is, for the row's tooltip. */
export function mediumRankReason(input: MediumRankInput, now: Date = new Date()): string {
  const weight = mediumFreshnessWeight(input.postedAt, now)
  const age = !input.postedAt
    ? "no posting date"
    : weight === 1
      ? "posted in the last three days"
      : weight === 0.6
        ? "posted in the last two weeks"
        : weight === 0.3
          ? "posted in the last two months"
          : "older than two months"
  const room =
    input.responseCount === 0
      ? "no responses yet"
      : input.responseCount === 1
        ? "1 response"
        : `${input.responseCount} responses`
  const reach =
    input.writerFollowers === null
      ? "followers not known"
      : `writer has ${input.writerFollowers.toLocaleString("en-US")} ${input.writerFollowers === 1 ? "follower" : "followers"}`
  const place = input.position === 0 ? "First in the keyword's list" : `Number ${input.position + 1} in the keyword's list`
  return `${input.named ? "Names you or a rival. " : ""}${place}, ${age}, ${room}, ${reach}`
}
