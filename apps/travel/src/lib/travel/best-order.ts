/**
 * The shortest way round a day's stops (Travel features part 5). Pure, so the
 * ordering can be tested without Google. Points are numbered: the stops to
 * order, then the start and the end when there are any. `minutes(a, b)` is
 * the time from point a to point b, or null when there's no route.
 */

/** Every order is tried up to this many stops; past it, each step goes to the nearest stop left. */
export const BEST_ORDER_EXACT_MAX = 8

/** A pair with no route counts as this long, so it is only used when nothing else will do. */
const NO_ROUTE_MINUTES = 10_000

export type RoutePlan = {
  /** The stops in their new order, as indexes into the stops given. */
  order: number[]
  /** Minutes along the new order, start and end included. */
  minutes: number
  /** Minutes along the order the stops were given in. */
  currentMinutes: number
}

/**
 * Orders `count` stops for the shortest trip from `start` through all of them
 * to `end`. With no start, the first stop stays first, as the day's first
 * card does today. With no end, the trip ends at whichever stop is last.
 */
export function planRoute({
  count,
  start,
  end,
  minutes,
}: {
  count: number
  /** The point to set out from, or null to keep the first stop first. */
  start: number | null
  /** The point to come back to, or null for none. */
  end: number | null
  minutes: (from: number, to: number) => number | null
}): RoutePlan {
  const cost = (from: number, to: number) => minutes(from, to) ?? NO_ROUTE_MINUTES
  const stops = Array.from({ length: count }, (_, index) => index)
  const length = (order: number[]) => {
    let total = 0
    let at = start
    for (const stop of order) {
      if (at !== null) total += cost(at, stop)
      at = stop
    }
    if (end !== null && at !== null) total += cost(at, end)
    return total
  }
  const currentMinutes = length(stops)
  if (count < 2) return { order: stops, minutes: currentMinutes, currentMinutes }

  // With no start, the first stop is where the day sets out from.
  const fixed = start === null ? [0] : []
  const free = start === null ? stops.slice(1) : stops
  const from = start ?? 0

  if (free.length <= BEST_ORDER_EXACT_MAX) {
    let best = { order: stops, minutes: currentMinutes }
    const walk = (at: number, sofar: number[], left: number[], spent: number) => {
      // Already longer than the best found, so nothing after this can win.
      if (spent >= best.minutes) return
      if (left.length === 0) {
        const total = spent + (end !== null ? cost(at, end) : 0)
        if (total < best.minutes) best = { order: [...fixed, ...sofar], minutes: total }
        return
      }
      for (const next of left) {
        walk(next, [...sofar, next], left.filter((stop) => stop !== next), spent + cost(at, next))
      }
    }
    walk(from, [], free, 0)
    return { ...best, currentMinutes }
  }

  // Too many to try every order: each step goes to the nearest stop not yet visited.
  const order = [...fixed]
  const left = new Set(free)
  let at = from
  while (left.size) {
    let nearest = -1
    for (const stop of left) if (nearest === -1 || cost(at, stop) < cost(at, nearest)) nearest = stop
    order.push(nearest)
    left.delete(nearest)
    at = nearest
  }
  const total = length(order)
  return total < currentMinutes ? { order, minutes: total, currentMinutes } : { order: stops, minutes: currentMinutes, currentMinutes }
}

/**
 * The stay a day sets out from and the one it comes back to. A stay covers
 * the nights from its check-in day on: one checking in on Day 2 for 3 nights
 * covers the nights of Days 2, 3 and 4. The day starts where last night was
 * spent, or else where tonight will be, and ends where tonight will be.
 */
export function staysForDay<T extends { day: number | null; nights: number | null }>(stays: readonly T[], day: number) {
  const covering = (night: number) =>
    stays.find((stay) => stay.day !== null && stay.nights !== null && stay.day <= night && night <= stay.day + stay.nights - 1) ??
    null
  const tonight = covering(day)
  return { start: covering(day - 1) ?? tonight, end: tonight }
}
