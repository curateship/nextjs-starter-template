import { and, eq, isNull, ne } from "drizzle-orm"

import { dateOfDay } from "@/lib/travel/dates"
import { samePlace } from "@/lib/travel/same-place"
import type { Place } from "@/lib/travel/rules"
import { db, type CustomShellDb } from "@/server/db"
import { travelActivities, travelTrips } from "@/server/travel/schema"

/** A card's place done on another trip (Travel features 3, part 10). */
export type BeenHere = {
  /** The card on this trip. */
  activityId: string
  /** The latest visit. */
  tripId: string
  tripName: string
  visitId: string
  /** The day it was done, as YYYY-MM-DD, when that trip has dates. */
  date: string | null
  rating: number | null
  /** How many other times it was done, besides the latest. */
  more: number
}

type Visit = { id: string; title: string; place: Place | null; tripId: string; tripName: string; date: string | null; rating: number | null; at: Date }

/**
 * The cards on this trip whose place was marked Done on another of the
 * person's trips (Travel features 3, part 10; Tyler, 5 Nov 2026: "Card mark +
 * panel line"). Only cards with a place count, on both sides, so two cards
 * called "Lunch" never match: the same Google place when both have one,
 * otherwise the same place name (`samePlace`). Trips and cards in a bin are
 * left out. With several visits the latest is shown, by its date, or by
 * when it was last changed on a trip with no dates.
 */
export async function listBeenHere(
  userId: string,
  tripId: string,
  cards: readonly { id: string; title: string; place: Place | null }[],
  database: Pick<CustomShellDb, "select"> = db
): Promise<BeenHere[]> {
  const placed = cards.filter((card) => card.place?.placeId || card.place?.name)
  if (!placed.length) return []
  const rows = await database
    .select({
      id: travelActivities.id,
      title: travelActivities.title,
      place: travelActivities.place,
      rating: travelActivities.rating,
      day: travelActivities.day,
      at: travelActivities.updatedAt,
      tripId: travelTrips.id,
      tripName: travelTrips.name,
      startDate: travelTrips.startDate,
    })
    .from(travelActivities)
    .innerJoin(travelTrips, eq(travelTrips.id, travelActivities.tripId))
    .where(
      and(
        eq(travelTrips.ownerUserId, userId),
        ne(travelTrips.id, tripId),
        isNull(travelTrips.deletedAt),
        isNull(travelActivities.deletedAt),
        eq(travelActivities.done, true)
      )
    )
  const visits: Visit[] = rows
    .filter((row) => row.place?.placeId || row.place?.name)
    .map((row) => ({
      id: row.id,
      title: row.title,
      place: row.place,
      tripId: row.tripId,
      tripName: row.tripName,
      date: row.day === null ? null : dateOfDay(row.startDate, row.day),
      rating: row.rating,
      at: row.at,
    }))
  if (!visits.length) return []
  const latestFirst = (a: Visit, b: Visit) => {
    if (a.date && b.date) return b.date.localeCompare(a.date)
    if (a.date) return -1
    if (b.date) return 1
    return b.at.getTime() - a.at.getTime()
  }
  return placed.flatMap((card) => {
    const matches = visits.filter((visit) => samePlace(card, visit)).sort(latestFirst)
    const [latest] = matches
    if (!latest) return []
    return [
      {
        activityId: card.id,
        tripId: latest.tripId,
        tripName: latest.tripName,
        visitId: latest.id,
        date: latest.date,
        rating: latest.rating,
        more: matches.length - 1,
      },
    ]
  })
}
