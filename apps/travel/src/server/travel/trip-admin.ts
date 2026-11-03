import { and, asc, eq, inArray, isNotNull, isNull, lt, ne } from "drizzle-orm"

import { tripHasEnded } from "@/lib/travel/dates"
import { TRAVEL_ERRORS } from "@/lib/travel/errors"
import { now, uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { requireActivity, requireTrip } from "@/server/travel/access"
import { travelActivities, travelTrips } from "@/server/travel/schema"
import { MAX_ACTIVITIES, toActivity, writePositions, type Activity } from "@/server/travel/trips"
import { findPlace } from "@/server/travel/weather"

/** How long an activity stays in a trip's bin (task part 38). */
const BIN_DAYS = 30

/**
 * Archiving a trip takes it off the Trips table into its Archived tab, and
 * bringing it back undoes that (task part 38). Nothing on it changes.
 */
export async function setTripArchived(userId: string, tripId: string, archived: boolean, database: CustomShellDb = db) {
  await requireTrip(userId, tripId, database)
  await database
    .update(travelTrips)
    .set({ archivedAt: archived ? now() : null, updatedAt: now() })
    .where(eq(travelTrips.id, tripId))
}

/**
 * Copy trip (task part 39). The copy keeps the days, each day's
 * description, every activity in its place with its type, times, place, links,
 * notes, cost and picture, and the trip's description. It drops the dates,
 * Done ticks, ratings, the trip's notes and the calendar link,
 * because those belong to the trip that happened.
 */
export async function copyTrip(userId: string, input: { tripId: string; name: string }, database: CustomShellDb = db) {
  const trip = await requireTrip(userId, input.tripId, database)
  const activities = await database
    .select()
    .from(travelActivities)
    .where(and(eq(travelActivities.tripId, trip.id), isNull(travelActivities.deletedAt)))
    .orderBy(asc(travelActivities.position))
  const id = uuid()
  const at = now()
  await database.transaction(async (tx) => {
    await tx.insert(travelTrips).values({
      ...trip,
      id,
      name: input.name,
      startDate: null,
      status: "planning",
      calendarToken: null,
      isSample: false,
      archivedAt: null,
      tags: trip.tags.filter((tag) => tag !== "Sample"),
      createdAt: at,
      updatedAt: at,
    })
    if (activities.length) {
      await tx.insert(travelActivities).values(
        activities.map((activity) => ({
          ...activity,
          id: uuid(),
          tripId: id,
          done: false,
          rating: null,
          goAgain: false,
          createdAt: at,
          updatedAt: at,
        }))
      )
    }
  })
  return { id }
}

/**
 * A trip turns Done by itself the day after its last day (task part 36). Run
 * on the Trips table's load, so the table is right whenever it is looked at.
 */
export async function markEndedTripsDone(userId: string, database: CustomShellDb = db, at: Date = new Date()) {
  const open = await database
    .select({ id: travelTrips.id, startDate: travelTrips.startDate, days: travelTrips.days, timeZone: travelTrips.timeZone })
    .from(travelTrips)
    .where(and(eq(travelTrips.ownerUserId, userId), ne(travelTrips.status, "done"), isNotNull(travelTrips.startDate)))
  const ended = open.filter((trip) => tripHasEnded(trip, at)).map((trip) => trip.id)
  if (ended.length) {
    await database.update(travelTrips).set({ status: "done", updatedAt: now() }).where(inArray(travelTrips.id, ended))
  }
}

export type BinEntry = Activity & { deletedAt: string }

/** The trip's bin, newest first. Anything older than 30 days is emptied for good on the way. */
export async function listBin(userId: string, tripId: string, database: CustomShellDb = db, at: Date = new Date()) {
  const trip = await requireTrip(userId, tripId, database)
  const cutoff = new Date(at.getTime() - BIN_DAYS * 24 * 60 * 60 * 1000)
  await database
    .delete(travelActivities)
    .where(and(eq(travelActivities.tripId, trip.id), isNotNull(travelActivities.deletedAt), lt(travelActivities.deletedAt, cutoff)))
  const rows = await database
    .select()
    .from(travelActivities)
    .where(and(eq(travelActivities.tripId, trip.id), isNotNull(travelActivities.deletedAt)))
  return rows
    .sort((a, b) => b.deletedAt!.getTime() - a.deletedAt!.getTime())
    .map((row): BinEntry => ({ ...toActivity(row), deletedAt: row.deletedAt!.toISOString() }))
}

/**
 * Puts an activity back at the end of its old day. A day that's gone (the
 * trip got shorter) sends it to Ideas instead.
 */
export async function restoreFromBin(userId: string, activityId: string, database: CustomShellDb = db) {
  const { activity, trip } = await requireActivity(userId, activityId, database, { inBin: true })
  if (!activity.deletedAt) return
  const live = await database
    .select({ id: travelActivities.id, day: travelActivities.day })
    .from(travelActivities)
    .where(and(eq(travelActivities.tripId, trip.id), isNull(travelActivities.deletedAt)))
    .orderBy(asc(travelActivities.position))
  if (live.length >= MAX_ACTIVITIES) throw new Error(TRAVEL_ERRORS.tooManyActivities)
  const day = activity.day !== null && activity.day <= trip.days ? activity.day : null
  await database.transaction(async (tx) => {
    await tx
      .update(travelActivities)
      .set({ deletedAt: null, day, startTime: day === null ? null : activity.startTime, updatedAt: now() })
      .where(eq(travelActivities.id, activity.id))
    await writePositions([...live.filter((item) => item.day === day).map((item) => item.id), activity.id], tx)
  })
}

/** Empties one activity from the bin for good. */
export async function deleteFromBin(userId: string, activityId: string, database: CustomShellDb = db) {
  const { activity } = await requireActivity(userId, activityId, database, { inBin: true })
  if (!activity.deletedAt) throw new Error(TRAVEL_ERRORS.activityNotFound)
  await database.delete(travelActivities).where(eq(travelActivities.id, activity.id))
}

export type TripPin = { tripId: string; name: string; destination: string; lat: number; lng: number }

/**
 * A pin for every trip with a destination, for the places-visited map (task
 * part 40). Destinations are found with Open-Meteo's free place search, the
 * same one the weather uses, and remembered for a day.
 */
export async function loadTripPins(userId: string, database: CustomShellDb = db): Promise<TripPin[]> {
  const trips = await database
    .select({ id: travelTrips.id, name: travelTrips.name, destination: travelTrips.destination })
    .from(travelTrips)
    .where(and(eq(travelTrips.ownerUserId, userId), isNotNull(travelTrips.destination)))
  const pins: TripPin[] = []
  for (const trip of trips.slice(0, 200)) {
    if (!trip.destination?.trim()) continue
    const point = await findPlace(trip.destination)
    if (point) pins.push({ tripId: trip.id, name: trip.name, destination: trip.destination, lat: point.latitude, lng: point.longitude })
  }
  return pins
}
