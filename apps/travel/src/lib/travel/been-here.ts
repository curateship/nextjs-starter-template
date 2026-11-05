/** What the right panel says about a place done on another trip (Travel features 3, part 10). */
export type BeenHereLine = { tripName: string; date: string | null; rating: number | null; more: number }

const MONTH_YEAR = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })

/** "Been here: Kyoto, March 2026, you gave it 2 of 5, and 2 more times". */
export function beenHereText({ tripName, date, rating, more }: BeenHereLine) {
  const parts = [`Been here: ${tripName}`]
  if (date) parts.push(MONTH_YEAR.format(new Date(`${date}T00:00:00Z`)))
  if (rating) parts.push(`you gave it ${rating} of 5`)
  if (more) parts.push(`and ${more === 1 ? "1 more time" : `${more} more times`}`)
  return parts.join(", ")
}
