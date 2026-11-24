/**
 * Where an owner's listing stands among the others in its category, for My
 * listings (Tyler's pick, 24 Nov 2026: "Where my listing ranks").
 *
 * - **Its primary category**, the one marked Primary in its categories, or
 *   the first one in the site's own order when none is marked, the same pick
 *   a listing card makes for its category line.
 * - **Views over the last 30 days**, counted as Admin → Listings counts them,
 *   so an admin's own visits never count.
 * - **Only the top ten say anything.** A listing ranked 12th, one nobody has
 *   viewed, and one in a category of fewer than three published listings show
 *   no line: "1st of 2" tells an owner nothing.
 * - **Two listings with the same views share a place**, so two can both be
 *   2nd and the next one is 4th.
 */

export const RANK_DAYS = 30
const RANK_TOP = 10
const RANK_MIN_PEERS = 3

export type ListingRank = { position: number; category: string }

/** "1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st". */
export function ordinal(position: number): string {
  const lastTwo = position % 100
  if (lastTwo >= 11 && lastTwo <= 13) return `${position}th`
  const ending = { 1: "st", 2: "nd", 3: "rd" }[position % 10] ?? "th"
  return `${position}${ending}`
}

/** "3rd most viewed in Ramen over the last 30 days." */
export function rankSentence(rank: ListingRank): string {
  return `${ordinal(rank.position)} most viewed in ${rank.category} over the last ${RANK_DAYS} days.`
}

/** The rank worth saying, or null: viewed at all, in the top ten, among enough listings. */
export function rankToShow(found: { position: number; category: string; views: number; peers: number } | null): ListingRank | null {
  if (!found || found.views <= 0 || found.position > RANK_TOP || found.peers < RANK_MIN_PEERS) return null
  return { position: found.position, category: found.category }
}
