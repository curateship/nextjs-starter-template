import { and, asc, eq, inArray, isNull } from "drizzle-orm"

import { MAX_TRIP_DAYS } from "@/lib/travel/rules"
import { TRAVEL_ERRORS } from "@/lib/travel/errors"
import { now, uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { requireActivity, requireTrip, type ActivityRow, type TripRow } from "@/server/travel/access"
import { travelActivities, travelTrips } from "@/server/travel/schema"
import { readDayInfo } from "@/lib/travel/trip-days"
import { MAX_ACTIVITIES, writePositions } from "@/server/travel/trips"

type Tx = Parameters<Parameters<CustomShellDb["transaction"]>[0]>[0]

/**
 * Changing a trip's days and moving many cards at once (task parts 10, 11,
 * 14 and 16). Each change renumbers the activities and the per-day
 * description together in one transaction, so a day's things always stay with it.
 */

async function liveActivities(tripId: string, database: Pick<CustomShellDb, "select">) {
  return database
    .select()
    .from(travelActivities)
    .where(and(eq(travelActivities.tripId, tripId), isNull(travelActivities.deletedAt)))
    .orderBy(asc(travelActivities.position))
}

/**
 * Moves every activity on the trip by `map` (old day → new day, null for a
 * day that went). Activities on a day that went are handled by the caller.
 */
async function renumberDays(trip: TripRow, map: (day: number) => number | null, tx: Tx) {
  const at = now()
  const activities = await tx
    .select({ id: travelActivities.id, day: travelActivities.day })
    .from(travelActivities)
    .where(eq(travelActivities.tripId, trip.id))
  for (const activity of activities) {
    if (activity.day === null) continue
    const next = map(activity.day)
    if (next !== null && next !== activity.day) {
      await tx.update(travelActivities).set({ day: next, updatedAt: at }).where(eq(travelActivities.id, activity.id))
    }
  }
}

/** Adds an empty day after `after` (0 puts it first). Later days move along by one. */
export async function addDay(
  userId: string,
  input: { tripId: string; after: number },
  database: CustomShellDb = db
) {
  const trip = await requireTrip(userId, input.tripId, database)
  if (trip.days >= MAX_TRIP_DAYS) throw new Error(TRAVEL_ERRORS.tooManyDays)
  const after = Math.max(0, Math.min(input.after, trip.days))
  await database.transaction(async (tx) => {
    await renumberDays(trip, (day) => (day > after ? day + 1 : day), tx)
    const dayInfo = readDayInfo(trip)
    dayInfo.splice(after, 0, { note: "" })
    await tx
      .update(travelTrips)
      .set({ days: trip.days + 1, dayInfo, updatedAt: now() })
      .where(eq(travelTrips.id, trip.id))
  })
}

/**
 * Removes a day. Its activities go to the bin or to Ideas, as asked, and later
 * days move back by one. On a dated trip the end date moves with it, because
 * the end is the start plus the number of days.
 */
export async function removeDay(
  userId: string,
  input: { tripId: string; day: number; activities: "bin" | "ideas" },
  database: CustomShellDb = db
) {
  const trip = await requireTrip(userId, input.tripId, database)
  if (input.day < 1 || input.day > trip.days) throw new Error(TRAVEL_ERRORS.dayOutOfRange)
  if (trip.days <= 1) throw new Error(TRAVEL_ERRORS.lastDay)
  await database.transaction(async (tx) => {
    const at = now()
    const onDay = (await liveActivities(trip.id, tx)).filter((activity) => activity.day === input.day)
    if (input.activities === "bin") {
      for (const activity of onDay) {
        await tx
          .update(travelActivities)
          .set({ deletedAt: at, updatedAt: at })
          .where(eq(travelActivities.id, activity.id))
      }
    } else {
      const ideas = (await liveActivities(trip.id, tx)).filter((activity) => activity.day === null)
      for (const activity of onDay) {
        await tx
          .update(travelActivities)
          .set({ day: null, startTime: null, updatedAt: at })
          .where(eq(travelActivities.id, activity.id))
      }
      await writePositions([...ideas, ...onDay].map((activity) => activity.id), tx)
    }
    // Binned cards keep the day they had, so putting one back finds a day
    // that may have moved; the bin puts it on the nearest day that exists.
    await renumberDays(trip, (day) => (day === input.day ? null : day > input.day ? day - 1 : day), tx)
    const dayInfo = readDayInfo(trip)
    dayInfo.splice(input.day - 1, 1)
    await tx
      .update(travelTrips)
      .set({ days: trip.days - 1, dayInfo, updatedAt: at })
      .where(eq(travelTrips.id, trip.id))
  })
}

/**
 * Moves a whole day to another place in the trip (task part 10, dragging a
 * column). The days between shift by one to make room, as cards do in a column.
 */
export async function moveDay(
  userId: string,
  input: { tripId: string; from: number; to: number },
  database: CustomShellDb = db
) {
  const trip = await requireTrip(userId, input.tripId, database)
  const { from, to } = input
  if (from < 1 || from > trip.days || to < 1 || to > trip.days) throw new Error(TRAVEL_ERRORS.dayOutOfRange)
  if (from === to) return
  const map = (day: number) => {
    if (day === from) return to
    if (from < to && day > from && day <= to) return day - 1
    if (from > to && day >= to && day < from) return day + 1
    return day
  }
  await database.transaction(async (tx) => {
    await renumberDays(trip, map, tx)
    const before = readDayInfo(trip)
    const dayInfo = [...before]
    before.forEach((info, index) => {
      dayInfo[map(index + 1)! - 1] = info
    })
    await tx.update(travelTrips).set({ dayInfo, updatedAt: now() }).where(eq(travelTrips.id, trip.id))
  })
}

/** What a copy of an activity keeps: everything except Done, the rating and "would go again". */
function copyOf(activity: ActivityRow, at: Date): Omit<ActivityRow, "id" | "day" | "position"> {
  const { id: _id, day: _day, position: _position, ...rest } = activity
  return { ...rest, done: false, rating: null, goAgain: false, deletedAt: null, createdAt: at, updatedAt: at }
}

/** Copies one day's activities onto the end of another day (task part 11). Returns the new ids. */
export async function copyDay(
  userId: string,
  input: { tripId: string; from: number; to: number },
  database: CustomShellDb = db
) {
  const trip = await requireTrip(userId, input.tripId, database)
  const { from, to } = input
  if (from < 1 || from > trip.days || to < 1 || to > trip.days) throw new Error(TRAVEL_ERRORS.dayOutOfRange)
  const all = await liveActivities(trip.id, database)
  const source = all.filter((activity) => activity.day === from)
  if (all.length + source.length > MAX_ACTIVITIES) throw new Error(TRAVEL_ERRORS.tooManyActivities)
  const startAt = all.filter((activity) => activity.day === to).length
  const at = now()
  const made = source.map((activity, index) => ({
    ...copyOf(activity, at),
    id: uuid(),
    day: to,
    position: startAt + index,
  }))
  if (made.length) await database.insert(travelActivities).values(made)
  return { created: made.map((activity) => activity.id) }
}

/** A copy of one activity, right under it in its column (task part 15). */
export async function duplicateActivity(userId: string, activityId: string, database: CustomShellDb = db) {
  const { activity, trip } = await requireActivity(userId, activityId, database)
  const all = await liveActivities(trip.id, database)
  if (all.length >= MAX_ACTIVITIES) throw new Error(TRAVEL_ERRORS.tooManyActivities)
  const id = uuid()
  await database.transaction(async (tx) => {
    await tx.insert(travelActivities).values({ ...copyOf(activity, now()), id, day: activity.day, position: 0 })
    const column = all.filter((item) => item.day === activity.day).map((item) => item.id)
    column.splice(column.indexOf(activity.id) + 1, 0, id)
    await writePositions(column, tx)
  })
  return { id }
}

/** Moves several activities onto the end of one day, in the order given (task part 14). */
export async function moveActivities(
  userId: string,
  input: { activityIds: string[]; day: number | null },
  database: CustomShellDb = db
) {
  if (input.activityIds.length === 0) return { done: [] as string[] }
  const first = await requireActivity(userId, input.activityIds[0], database)
  const trip = first.trip
  if (input.day !== null && input.day > trip.days) throw new Error(TRAVEL_ERRORS.dayOutOfRange)
  const all = await liveActivities(trip.id, database)
  const ids = new Set(all.map((activity) => activity.id))
  const moving = input.activityIds.filter((id) => ids.has(id))
  await database.transaction(async (tx) => {
    const at = now()
    const leftFrom = new Set<number | null>()
    for (const id of moving) {
      const activity = all.find((item) => item.id === id)!
      leftFrom.add(activity.day)
      await tx
        .update(travelActivities)
        .set({ day: input.day, startTime: input.day === null ? null : activity.startTime, updatedAt: at })
        .where(eq(travelActivities.id, id))
    }
    const stay = all.filter((activity) => activity.day === input.day && !moving.includes(activity.id))
    await writePositions([...stay.map((activity) => activity.id), ...moving], tx)
    for (const day of leftFrom) {
      if (day === input.day) continue
      await writePositions(
        all.filter((activity) => activity.day === day && !moving.includes(activity.id)).map((activity) => activity.id),
        tx
      )
    }
  })
  return { done: moving }
}

/** Where an activity was before a change, so Undo can put it back exactly. */
export type ActivityPlace = { id: string; day: number | null; position: number; inBin: boolean }

/**
 * Undo (task part 16). Puts each activity back on its day, at its position,
 * in or out of the bin, and removes the copies a change made. Every id must be
 * on the same trip, and that trip must be the person's.
 */
export async function restoreActivities(
  userId: string,
  input: { tripId: string; places: ActivityPlace[]; created: string[] },
  database: CustomShellDb = db
) {
  const trip = await requireTrip(userId, input.tripId, database)
  const ids = [...input.places.map((place) => place.id), ...input.created]
  if (ids.length === 0) return
  const rows = await database
    .select({ id: travelActivities.id })
    .from(travelActivities)
    .where(and(eq(travelActivities.tripId, trip.id), inArray(travelActivities.id, ids)))
  const found = new Set(rows.map((row) => row.id))
  if (input.places.some((place) => !found.has(place.id))) throw new Error(TRAVEL_ERRORS.undoGone)
  await database.transaction(async (tx) => {
    const at = now()
    const created = input.created.filter((id) => found.has(id))
    if (created.length) await tx.delete(travelActivities).where(inArray(travelActivities.id, created))
    for (const place of input.places) {
      const day = place.day !== null && place.day > trip.days ? null : place.day
      await tx
        .update(travelActivities)
        .set({ day, position: place.position, deletedAt: place.inBin ? at : null, updatedAt: at })
        .where(eq(travelActivities.id, place.id))
    }
  })
}
