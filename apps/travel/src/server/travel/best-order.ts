import { and, asc, eq, isNull } from "drizzle-orm"

import { planRoute, staysForDay } from "@/lib/travel/best-order"
import { sortColumn } from "@/lib/travel/board"
import { TRAVEL_ERRORS } from "@/lib/travel/errors"
import type { TravelMode } from "@/lib/travel/rules"
import { db, type CustomShellDb } from "@/server/db"
import { requireTrip, type ActivityRow } from "@/server/travel/access"
import { routeKey, routeMinutes, type LatLng } from "@/server/travel/google"
import { spendGoogleLookup } from "@/server/travel/google-usage"
import { travelActivities } from "@/server/travel/schema"
import { writePositions } from "@/server/travel/trips"

/** How many travel times are asked of Google at once. */
const AT_ONCE = 4

/** Asks for the minutes between two points. Google's saved-time lookup in real use, swapped out in tests. */
export type RouteMinutes = (from: LatLng, to: LatLng, mode: TravelMode) => Promise<number | null>

export type BestOrderResult = {
  /** The untimed cards that had a map position and were put in order. */
  ordered: number
  /**
   * Minutes the new order saves on the old, 0 when the day was already in its
   * best order. Null when Google found no route between some stops, since a
   * total with a gap in it says nothing.
   */
  savedMinutes: number | null
  /** Whether the day set out from a stay, or kept its first card first. */
  from: "stay" | "first"
  /** Pairs of stops Google found no route between. */
  missing: number
}

const positionOf = (activity: Pick<ActivityRow, "place">): LatLng | null =>
  typeof activity.place?.lat === "number" && typeof activity.place.lng === "number"
    ? { lat: activity.place.lat, lng: activity.place.lng }
    : null

/**
 * Best order for a day (Travel features part 5; Tyler, 3 Nov 2026: "From the
 * hotel"). The day's cards with no start time and a map position are put in
 * the order that is quickest to get round, in the trip's way of getting
 * around. The day sets out from the stay where last night was spent, or else
 * tonight's, and comes back to tonight's; with no stay the first of them
 * stays first. Timed cards stay where their times put them, and stays and
 * cards with no position keep their order after the rest.
 *
 * The time one way between two places counts for both ways, so each pair is
 * asked of Google once. Times are saved, so asking again costs nothing. With
 * no Google key the first question fails with googleOff, which the person
 * sees; a day with fewer than two cards to order asks nothing.
 */
export async function bestOrderForDay(
  userId: string,
  input: { tripId: string; day: number },
  {
    database = db,
    minutes = (from, to, mode) => routeMinutes(from, to, mode, () => spendGoogleLookup(userId, database)),
  }: { database?: CustomShellDb; minutes?: RouteMinutes } = {}
): Promise<BestOrderResult> {
  const trip = await requireTrip(userId, input.tripId, database)
  if (input.day < 1 || input.day > trip.days) throw new Error(TRAVEL_ERRORS.dayOutOfRange)

  const live = await database
    .select()
    .from(travelActivities)
    .where(and(eq(travelActivities.tripId, trip.id), isNull(travelActivities.deletedAt)))
    .orderBy(asc(travelActivities.position))
  const isStay = (activity: ActivityRow) => activity.nights !== null && activity.nights >= 1
  const stays = live.filter((activity) => isStay(activity) && positionOf(activity))
  const { start, end } = staysForDay(stays, input.day)

  const column = sortColumn(live.filter((activity) => activity.day === input.day))
  const timed = column.filter((activity) => activity.startTime)
  const untimed = column.filter((activity) => !activity.startTime)
  const stops = untimed.filter((activity) => !isStay(activity) && positionOf(activity))
  const rest = untimed.filter((activity) => !stops.includes(activity))
  const from = start ? "stay" : "first"
  if (stops.length < 2) return { ordered: stops.length, savedMinutes: 0, from, missing: 0 }

  // Points: the stops, then the stay to set out from and the one to come back to.
  const points = [...stops, ...(start ? [start] : []), ...(end ? [end] : [])].map((activity) => positionOf(activity)!)
  const startPoint = start ? stops.length : null
  const endPoint = end ? stops.length + (start ? 1 : 0) : null

  // One question per pair of places, both ways answered by it.
  const pairKey = (a: LatLng, b: LatLng) => [routeKey(a), routeKey(b)].sort().join("|")
  const pairs = new Map<string, [LatLng, LatLng]>()
  for (let a = 0; a < points.length; a += 1) {
    for (let b = a + 1; b < points.length; b += 1) {
      // The same place twice, such as setting out from and coming back to one hotel, is no walk at all.
      if (routeKey(points[a]) !== routeKey(points[b])) pairs.set(pairKey(points[a], points[b]), [points[a], points[b]])
    }
  }
  const found = new Map<string, number | null>()
  const queue = [...pairs.entries()]
  async function work() {
    for (let next = queue.shift(); next; next = queue.shift()) {
      const [key, [a, b]] = next
      found.set(key, await minutes(a, b, trip.travelMode))
    }
  }
  await Promise.all(Array.from({ length: Math.min(AT_ONCE, queue.length) }, work))

  const between = (a: number, b: number) =>
    routeKey(points[a]) === routeKey(points[b]) ? 0 : (found.get(pairKey(points[a], points[b])) ?? null)
  const plan = planRoute({ count: stops.length, start: startPoint, end: endPoint, minutes: between })
  const missing = [...found.values()].filter((value) => value === null).length

  const ordered = plan.order.map((index) => stops[index])
  await database.transaction(async (tx) => {
    await writePositions([...timed, ...ordered, ...rest].map((activity) => activity.id), tx)
  })
  const savedMinutes = missing ? null : Math.max(0, plan.currentMinutes - plan.minutes)
  return { ordered: stops.length, savedMinutes, from, missing }
}
