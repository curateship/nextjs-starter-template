import { and, asc, eq, inArray, isNotNull, isNull, lt, ne } from "drizzle-orm"

import { tripHasEnded } from "@/lib/travel/dates"
import { TRAVEL_ERRORS } from "@/lib/travel/errors"
import { now, uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { requireActivity, requireTrip } from "@/server/travel/access"
import { travelActivities, travelTrips } from "@/server/travel/schema"
import { MAX_ACTIVITIES, toActivity, writePositions, type Activity } from "@/server/travel/trips"
import { copyActivityPhotos } from "@/server/travel/activity-photos"
import { copiedNotes } from "@/lib/travel/notes"
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
 * because those belong to the trip that happened. Each card keeps its row of
 * photos, and a note's Place and Map blocks point at the copied cards
 * (Travel features 3, parts 2, 4 and 5).
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
  const copies = new Map(activities.map((activity) => [activity.id, uuid()]))
  await database.transaction(async (tx) => {
    await tx.insert(travelTrips).values({
      ...trip,
      id,
      description: copiedNotes(trip.description, copies),
      name: input.name,
      startDate: null,
      status: "planning",
      calendarToken: null,
      isSample: false,
      archivedAt: null,
      deletedAt: null,
      tags: trip.tags.filter((tag) => tag !== "Sample"),
      createdAt: at,
      updatedAt: at,
    })
    if (activities.length) {
      await tx.insert(travelActivities).values(
        activities.map((activity) => ({
          ...activity,
          id: copies.get(activity.id)!,
          tripId: id,
          notes: copiedNotes(activity.notes, copies),
          done: false,
          rating: null,
          goAgain: false,
          createdAt: at,
          updatedAt: at,
        }))
      )
      await copyActivityPhotos(copies, tx)
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
      .set({
        deletedAt: null,
        day,
        startTime: day === null ? null : activity.startTime,
        dayPart: day === null ? null : activity.dayPart,
        updatedAt: now(),
      })
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
    .where(and(eq(travelTrips.ownerUserId, userId), isNotNull(travelTrips.destination), isNull(travelTrips.deletedAt)))
  const pins: TripPin[] = []
  for (const trip of trips.slice(0, 200)) {
    if (!trip.destination?.trim()) continue
    const point = await findPlace(trip.destination)
    if (point) pins.push({ tripId: trip.id, name: trip.name, destination: trip.destination, lat: point.latitude, lng: point.longitude })
  }
  return pins
}

/** A pin for a place done on one of the person's trips (Travel features 3, part 12). */
export type VisitedPin = {
  activityId: string
  title: string
  tripId: string
  tripName: string
  rating: number | null
  lat: number
  lng: number
}

/** The most pins the map of places been to draws. */
const VISITED_PINS_MAX = 2000

/**
 * Every card marked Done that has a place on the map, across all the
 * person's trips, for Places I've been on the Trips map (Travel features 3,
 * part 12; Tyler, 5 Nov 2026: "Small card on the map"). Trips and cards in a
 * bin are left out.
 */
export async function loadVisitedPins(userId: string, database: Pick<CustomShellDb, "select"> = db): Promise<VisitedPin[]> {
  const rows = await database
    .select({
      activityId: travelActivities.id,
      title: travelActivities.title,
      place: travelActivities.place,
      rating: travelActivities.rating,
      tripId: travelTrips.id,
      tripName: travelTrips.name,
    })
    .from(travelActivities)
    .innerJoin(travelTrips, eq(travelTrips.id, travelActivities.tripId))
    .where(
      and(
        eq(travelTrips.ownerUserId, userId),
        isNull(travelTrips.deletedAt),
        isNull(travelActivities.deletedAt),
        eq(travelActivities.done, true)
      )
    )
    .orderBy(asc(travelTrips.name), asc(travelActivities.title))
  return rows
    .flatMap(({ place, ...row }) =>
      typeof place?.lat === "number" && typeof place?.lng === "number" ? [{ ...row, lat: place.lat, lng: place.lng }] : []
    )
    .slice(0, VISITED_PINS_MAX)
}
