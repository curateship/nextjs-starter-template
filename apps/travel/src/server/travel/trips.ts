import { and, asc, count, desc, eq, isNotNull, isNull, sql } from "drizzle-orm"

import type { ActivityType } from "@/lib/travel/activity-types"
import { TRAVEL_ERRORS } from "@/lib/travel/errors"
import type {
  CreateActivityInput,
  CreateTripInput,
  UpdateActivityInput,
  UpdateTripInput,
} from "@/lib/travel/schemas"
import { now, uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import {
  checkPicture,
  requireActivity,
  requireTrip,
  type ActivityRow,
  type TripRow,
} from "@/server/travel/access"
import {
  travelActivities,
  travelTripNotes,
  travelTrips,
} from "@/server/travel/schema"
import type { SavedView } from "@/lib/saved-views"
import { readDayInfo } from "@/lib/travel/trip-days"
import { tripViewScreen } from "@/lib/travel/trip-views"
import { deleteSavedViewsFor, listSavedViews } from "@/server/saved-views"
import { storedNotes } from "@/lib/travel/notes"
import { checkTypeId, listTypes } from "@/server/travel/types"

export const MAX_ACTIVITIES = 500

/** One row of the Trips table. */
export type TripListRow = {
  id: string
  name: string
  destination: string | null
  days: number
  startDate: string | null
  currency: string
  status: TripRow["status"]
  coverUrl: string | null
  tags: string[]
  isSample: boolean
  archived: boolean
  activityCount: number
  timeZone: string | null
  createdAt: string
}

export type TripsPage = { trips: TripListRow[] }

export type Activity = Omit<ActivityRow, "createdAt" | "updatedAt" | "deletedAt"> & {
  updatedAt: string
}

/** One of a trip's notes, from the note icon beside its cog. */
export type TripNote = { id: string; body: string; createdAt: string; updatedAt: string }

export type Trip = Omit<TripRow, "ownerUserId" | "createdAt" | "updatedAt" | "archivedAt" | "calendarToken"> & {
  archived: boolean
  hasCalendarLink: boolean
}

/** Everything the trip page draws, loaded in one go. */
export type TripPage = {
  trip: Trip
  activities: Activity[]
  types: ActivityType[]
  notes: TripNote[]
  binCount: number
  /** The person's saved views on this trip's board. */
  views: SavedView[]
}

function toTrip(row: TripRow): Trip {
  const { ownerUserId: _owner, createdAt: _created, updatedAt: _updated, archivedAt, calendarToken, ...rest } = row
  return { ...rest, archived: archivedAt !== null, hasCalendarLink: calendarToken !== null }
}

export function toActivity(row: ActivityRow): Activity {
  const { createdAt: _created, deletedAt: _deleted, updatedAt, ...rest } = row
  return { ...rest, updatedAt: updatedAt.toISOString() }
}

export async function loadTripsPage(userId: string, database: CustomShellDb = db): Promise<TripsPage> {
  const rows = await database
    .select({
      trip: travelTrips,
      activityCount: sql<number>`count(${travelActivities.id}) filter (where ${travelActivities.deletedAt} is null)`.mapWith(Number),
    })
    .from(travelTrips)
    .leftJoin(travelActivities, eq(travelActivities.tripId, travelTrips.id))
    .where(eq(travelTrips.ownerUserId, userId))
    .groupBy(travelTrips.id)
    .orderBy(desc(travelTrips.createdAt))
  return {
    trips: rows.map(({ trip, activityCount }) => ({
      id: trip.id,
      name: trip.name,
      destination: trip.destination,
      days: trip.days,
      startDate: trip.startDate,
      currency: trip.currency,
      status: trip.status,
      coverUrl: trip.coverUrl,
      tags: trip.tags,
      isSample: trip.isSample,
      archived: trip.archivedAt !== null,
      activityCount,
      timeZone: trip.timeZone,
      createdAt: trip.createdAt.toISOString(),
    })),
  }
}

export async function createTrip(userId: string, input: CreateTripInput, database: CustomShellDb = db) {
  const at = now()
  const id = uuid()
  await database.insert(travelTrips).values({
    id,
    ownerUserId: userId,
    name: input.name,
    destination: input.destination || null,
    days: input.days,
    startDate: input.startDate,
    currency: input.currency,
    timeZone: null,
    budgetCents: null,
    status: "planning",
    coverUrl: null,
    coverCredit: null,
    dayInfo: Array.from({ length: input.days }, () => ({ note: "" })),
    description: "",
    travelMode: "walk",
    tags: [],
    calendarToken: null,
    isSample: false,
    archivedAt: null,
    createdAt: at,
    updatedAt: at,
  })
  return { id }
}

export async function loadTripPage(userId: string, tripId: string, database: CustomShellDb = db): Promise<TripPage> {
  const trip = await requireTrip(userId, tripId, database)
  const [activities, types, notes, bin, views] = await Promise.all([
    database
      .select()
      .from(travelActivities)
      .where(and(eq(travelActivities.tripId, tripId), isNull(travelActivities.deletedAt)))
      .orderBy(asc(travelActivities.day), asc(travelActivities.position)),
    listTypes(userId, database),
    database
      .select()
      .from(travelTripNotes)
      .where(eq(travelTripNotes.tripId, tripId))
      .orderBy(desc(travelTripNotes.updatedAt)),
    database
      .select({ value: count() })
      .from(travelActivities)
      .where(and(eq(travelActivities.tripId, tripId), isNotNull(travelActivities.deletedAt))),
    listSavedViews(userId, tripViewScreen(tripId), database),
  ])
  return {
    trip: toTrip(trip),
    activities: activities.map(toActivity),
    types,
    notes: notes.map((note) => ({
      id: note.id,
      body: note.body,
      createdAt: note.createdAt.toISOString(),
      updatedAt: note.updatedAt.toISOString(),
    })),
    binCount: bin[0]?.value ?? 0,
    views,
  }
}

function checkTimeZone(timeZone: string | null | undefined) {
  if (!timeZone) return
  try {
    new Intl.DateTimeFormat("en-US", { timeZone })
  } catch {
    throw new Error(TRAVEL_ERRORS.unknownTimeZone)
  }
}

export async function updateTrip(userId: string, input: UpdateTripInput, database: CustomShellDb = db) {
  await requireTrip(userId, input.tripId, database)
  checkTimeZone(input.timeZone)
  if (input.coverUrl !== undefined) await checkPicture(userId, input.coverUrl, input.coverCredit, database)
  const { tripId, ...patch } = input
  const values: Partial<TripRow> = { ...patch, updatedAt: now() }
  if (patch.coverUrl === null) values.coverCredit = null
  if (patch.tags) values.tags = [...new Set(patch.tags)]
  if (patch.description !== undefined) values.description = storedNotes(patch.description)
  await database.update(travelTrips).set(values).where(eq(travelTrips.id, tripId))
}

export async function setDayInfo(
  userId: string,
  input: { tripId: string; day: number; note: string },
  database: CustomShellDb = db
) {
  const trip = await requireTrip(userId, input.tripId, database)
  if (input.day > trip.days) throw new Error(TRAVEL_ERRORS.dayOutOfRange)
  const dayInfo = readDayInfo(trip)
  dayInfo[input.day - 1] = { note: input.note }
  await database.update(travelTrips).set({ dayInfo, updatedAt: now() }).where(eq(travelTrips.id, trip.id))
}


export async function deleteTrip(userId: string, tripId: string, database: CustomShellDb = db) {
  await requireTrip(userId, tripId, database)
  await database.delete(travelTrips).where(eq(travelTrips.id, tripId))
  // The shell's views table can't cascade from a trip, so its views go here.
  await deleteSavedViewsFor({ screens: [tripViewScreen(tripId)] }, database)
}

/** The cards in one column, in their saved order. Null is the Ideas column. */
async function columnIds(tripId: string, day: number | null, database: Pick<CustomShellDb, "select">) {
  const rows = await database
    .select({ id: travelActivities.id })
    .from(travelActivities)
    .where(
      and(
        eq(travelActivities.tripId, tripId),
        day === null ? isNull(travelActivities.day) : eq(travelActivities.day, day),
        isNull(travelActivities.deletedAt)
      )
    )
    .orderBy(asc(travelActivities.position), asc(travelActivities.createdAt))
  return rows.map((row) => row.id)
}

async function countActivities(tripId: string, database: Pick<CustomShellDb, "select">) {
  const [row] = await database
    .select({ value: count() })
    .from(travelActivities)
    .where(and(eq(travelActivities.tripId, tripId), isNull(travelActivities.deletedAt)))
  return row?.value ?? 0
}

export async function createActivity(userId: string, input: CreateActivityInput, database: CustomShellDb = db) {
  const trip = await requireTrip(userId, input.tripId, database)
  if (input.day !== null && input.day > trip.days) throw new Error(TRAVEL_ERRORS.dayOutOfRange)
  await checkTypeId(userId, input.typeId, database)
  if ((await countActivities(trip.id, database)) >= MAX_ACTIVITIES) {
    throw new Error(TRAVEL_ERRORS.tooManyActivities)
  }
  const at = now()
  const id = uuid()
  const position = (await columnIds(trip.id, input.day, database)).length
  await database.insert(travelActivities).values({
    ...blankActivity(trip.id, at),
    id,
    day: input.day,
    position,
    title: input.title,
    typeId: input.typeId ?? null,
    startTime: input.startTime ?? null,
    costCents: input.costCents ?? null,
  })
  await touchTrip(trip.id, database)
  return { id }
}

/** Every field an activity starts with, before what the person typed. */
export function blankActivity(tripId: string, at: Date): Omit<ActivityRow, "id" | "title" | "day" | "position"> {
  return {
    tripId,
    typeId: null,
    startTime: null,
    durationMinutes: null,
    nights: null,
    place: null,
    openingHours: null,
    website: null,
    menuUrl: null,
    phone: null,
    notes: "",
    costCents: null,
    done: false,
    rating: null,
    goAgain: false,
    photoUrl: null,
    photoCredit: null,
    deletedAt: null,
    createdAt: at,
    updatedAt: at,
  }
}

export async function updateActivity(userId: string, input: UpdateActivityInput, database: CustomShellDb = db) {
  const { activity } = await requireActivity(userId, input.activityId, database)
  await checkTypeId(userId, input.typeId, database)
  if (input.photoUrl !== undefined) await checkPicture(userId, input.photoUrl, input.photoCredit, database)
  const { activityId, ...patch } = input
  const values: Partial<ActivityRow> = { ...patch, updatedAt: now() }
  if (patch.notes !== undefined) values.notes = storedNotes(patch.notes)
  if (patch.photoUrl === null) values.photoCredit = null
  await database.update(travelActivities).set(values).where(eq(travelActivities.id, activityId))
  await touchTrip(activity.tripId, database)
}

/**
 * Moves a card to a column and writes every position in the columns it left
 * and joined, in the order dropped. Ids in `order` that aren't in that column
 * are ignored, and cards missing from it keep their place after the rest, so
 * a stale screen can never move someone else's card or lose one.
 */
export async function moveActivity(
  userId: string,
  input: { activityId: string; day: number | null; order: string[] },
  database: CustomShellDb = db
) {
  const { activity, trip } = await requireActivity(userId, input.activityId, database)
  if (input.day !== null && input.day > trip.days) throw new Error(TRAVEL_ERRORS.dayOutOfRange)
  await database.transaction(async (tx) => {
    const there = new Set([...(await columnIds(trip.id, input.day, tx)), activity.id])
    const ordered = [...new Set(input.order)].filter((id) => there.has(id))
    const target = [...ordered, ...[...there].filter((id) => !ordered.includes(id))]
    await tx
      .update(travelActivities)
      .set({ day: input.day, updatedAt: now() })
      .where(eq(travelActivities.id, activity.id))
    await writePositions(target, tx)
    if (activity.day !== input.day) await writePositions(await columnIds(trip.id, activity.day, tx), tx)
  })
  await touchTrip(trip.id, database)
}

export async function writePositions(ids: string[], database: Pick<CustomShellDb, "update">) {
  for (const [position, id] of ids.entries()) {
    await database.update(travelActivities).set({ position }).where(eq(travelActivities.id, id))
  }
}

/** Into the trip's bin; it can be put back for 30 days. */
export async function binActivities(userId: string, activityIds: string[], database: CustomShellDb = db) {
  const done: string[] = []
  const tripIds = new Set<string>()
  for (const activityId of activityIds) {
    const { activity } = await requireActivity(userId, activityId, database)
    await database
      .update(travelActivities)
      .set({ deletedAt: now(), updatedAt: now() })
      .where(eq(travelActivities.id, activity.id))
    done.push(activity.id)
    tripIds.add(activity.tripId)
  }
  for (const tripId of tripIds) await touchTrip(tripId, database)
  return { done }
}

async function touchTrip(tripId: string, database: Pick<CustomShellDb, "update">) {
  await database.update(travelTrips).set({ updatedAt: now() }).where(eq(travelTrips.id, tripId))
}
