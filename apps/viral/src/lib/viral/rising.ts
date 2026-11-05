/**
 * Rising fast (`workspace/docs/sorts-and-score.md`). Tyler, 4 Nov 2026:
 * "Doubled in a day". A video is rising when its views at least doubled
 * between two daily figures one day apart, such as 40,000 yesterday and
 * 80,000 today. Client-safe and pure, so the server and the tests share it.
 */

/** How many times yesterday's views a video needs today to be rising. */
export const RISING_TIMES = 2

/** Views since the day before: how many times as many, and how many more. */
export type ViralGrowth = { times: number | null; gained: number | null }

export const NO_GROWTH: ViralGrowth = { times: null, gained: null }

/** One daily views figure, `day` as `YYYY-MM-DD`. */
export type ViewDay = { day: string; views: number }

/** The `YYYY-MM-DD` a figure is filed under: the UTC day. */
export function viewDay(at: Date): string {
  return at.toISOString().slice(0, 10)
}

function dayBefore(day: string): string {
  return viewDay(new Date(Date.parse(`${day}T00:00:00Z`) - 24 * 60 * 60 * 1000))
}

/**
 * The growth between a video's last two figures. It needs two figures on
 * days next to each other, and the newer one from today or yesterday, so a
 * video nobody has seen for a week stops claiming it is rising.
 */
export function growthFrom(days: ViewDay[], today: string): ViralGrowth {
  if (days.length < 2) return NO_GROWTH
  const sorted = [...days].sort((left, right) => (left.day < right.day ? 1 : -1))
  const [latest, previous] = sorted
  if (latest.day !== today && latest.day !== dayBefore(today)) return NO_GROWTH
  if (previous.day !== dayBefore(latest.day)) return NO_GROWTH
  const gained = latest.views - previous.views
  return { times: previous.views > 0 ? latest.views / previous.views : null, gained }
}

export function isRising(growth: ViralGrowth): boolean {
  return growth.times !== null && growth.times >= RISING_TIMES
}
