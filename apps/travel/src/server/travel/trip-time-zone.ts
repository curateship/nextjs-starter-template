import { eq } from "drizzle-orm"

import { db, type CustomShellDb } from "@/server/db"
import { requireTrip } from "@/server/travel/access"
import { travelTrips } from "@/server/travel/schema"
import { findPlace, type Point } from "@/server/travel/weather"

/**
 * The trip's time zone from its destination (Travel features 4, part 1; Tyler,
 * 6 Nov 2026: "New trip + destination change"). New trip and a change of
 * destination call this after saving, so a slow or failed lookup never stops
 * the save. It fills a trip with no time zone, or one it guessed before, and
 * never one the person picked in Trip settings. A destination Open-Meteo can't
 * place leaves the time zone as it was.
 */
export async function guessTripTimeZone(
  userId: string,
  tripId: string,
  find: (name: string) => Promise<Point | null> = findPlace,
  database: CustomShellDb = db
) {
  const trip = await requireTrip(userId, tripId, database)
  if (!trip.destination) return
  if (trip.timeZone && !trip.timeZoneGuessed) return
  const timeZone = (await find(trip.destination))?.timeZone
  if (!timeZone) return
  await database.update(travelTrips).set({ timeZone, timeZoneGuessed: true }).where(eq(travelTrips.id, trip.id))
}
