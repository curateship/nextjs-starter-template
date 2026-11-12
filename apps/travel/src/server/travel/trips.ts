import { and, asc, count, desc, eq, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm"

import type { ActivityType } from "@/lib/travel/activity-types"
import { alreadyOnTripMessage, TRAVEL_ERRORS } from "@/lib/travel/errors"
import { findSamePlace, type PlaceLike } from "@/lib/travel/same-place"
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
import { TRIP_BIN_DAYS } from "@/lib/travel/trip-bin"
import { listTripPhotos, type ActivityPhoto } from "@/server/travel/activity-photos"
import { listBeenHere, type BeenHere } from "@/server/travel/been-here"
import { NOTE_ORDER } from "@/server/travel/trip-notes"
import { isTimeZone } from "@/server/travel/weather"

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
  /** When the trip went into the bin, or null (Travel features part 8). */
  deletedAt: string | null
  activityCount: number
  /** The average of the stars given to its cards, or null with none rated (the Trips table's Rating column). */
  rating: number | null
  timeZone: string | null
  createdAt: string
}

export type TripsPage = { trips: TripListRow[] }

export type Activity = Omit<ActivityRow, "createdAt" | "updatedAt" | "deletedAt"> & {
  updatedAt: string
}

/** One of a trip's notes, from the note icon beside its cog, pinned or not (Travel features 4, part 7). */
export type TripNote = { id: string; body: string; pinned: boolean; createdAt: string; updatedAt: string }

export type Trip = Omit<TripRow, "ownerUserId" | "createdAt" | "updatedAt" | "archivedAt" | "deletedAt" | "calendarToken" | "timeZoneGuessed"> & {
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
  /** Each card's photos after its first, in its row's order (Travel features 3, part 5). */
  photos: ActivityPhoto[]
  /** Cards whose place was done on another trip (Travel features 3, part 10). */
  beenHere: BeenHere[]
}

function toTrip(row: TripRow): Trip {
  const { ownerUserId: _owner, createdAt: _created, updatedAt: _updated, archivedAt, deletedAt: _deleted, calendarToken, timeZoneGuessed: _guessed, ...rest } = row
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
      rating: sql<number | null>`avg(${travelActivities.rating}) filter (where ${travelActivities.deletedAt} is null and ${travelActivities.rating} is not null)`.mapWith(
        (value: string | null) => (value === null ? null : Math.round(Number(value) * 10) / 10)
      ),
    })
    .from(travelTrips)
    .leftJoin(travelActivities, eq(travelActivities.tripId, travelTrips.id))
    .where(eq(travelTrips.ownerUserId, userId))
    .groupBy(travelTrips.id)
    .orderBy(desc(travelTrips.createdAt))
  return {
    trips: rows.map(({ trip, activityCount, rating }) => ({
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
      deletedAt: trip.deletedAt?.toISOString() ?? null,
      activityCount,
      rating,
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
    descriptionLocked: false,
    travelMode: "walk",
    tags: [],
    calendarToken: null,
    isSample: false,
    archivedAt: null,
    deletedAt: null,
    createdAt: at,
    updatedAt: at,
  })
  return { id }
}

export async function loadTripPage(userId: string, tripId: string, database: CustomShellDb = db): Promise<TripPage> {
  const trip = await requireTrip(userId, tripId, database)
  const [activities, types, notes, bin, notesInBin, views, photos] = await Promise.all([
    database
      .select()
      .from(travelActivities)
      .where(and(eq(travelActivities.tripId, tripId), isNull(travelActivities.deletedAt)))
      .orderBy(asc(travelActivities.day), asc(travelActivities.position)),
    listTypes(userId, database),
    database
      .select()
      .from(travelTripNotes)
      .where(and(eq(travelTripNotes.tripId, tripId), isNull(travelTripNotes.deletedAt)))
      .orderBy(...NOTE_ORDER),
    database
      .select({ value: count() })
      .from(travelActivities)
      .where(and(eq(travelActivities.tripId, tripId), isNotNull(travelActivities.deletedAt))),
    // Binned notes share the cards' bin (Travel features 4, part 6), so its count holds both.
    database
      .select({ value: count() })
      .from(travelTripNotes)
      .where(and(eq(travelTripNotes.tripId, tripId), isNotNull(travelTripNotes.deletedAt))),
    listSavedViews(userId, tripViewScreen(tripId), database),
    listTripPhotos(tripId, database),
  ])
  const beenHere = await listBeenHere(userId, tripId, activities, database)
  return {
    trip: toTrip(trip),
    activities: activities.map(toActivity),
    types,
    notes: notes.map((note) => ({
      id: note.id,
      body: note.body,
      pinned: note.pinnedAt !== null,
      createdAt: note.createdAt.toISOString(),
      updatedAt: note.updatedAt.toISOString(),
    })),
    binCount: (bin[0]?.value ?? 0) + (notesInBin[0]?.value ?? 0),
    views,
    photos,
    beenHere,
  }
}

function checkTimeZone(timeZone: string | null | undefined) {
  if (timeZone && !isTimeZone(timeZone)) throw new Error(TRAVEL_ERRORS.unknownTimeZone)
}

export async function updateTrip(userId: string, input: UpdateTripInput, database: CustomShellDb = db) {
  const trip = await requireTrip(userId, input.tripId, database)
  // A locked description takes no writing until it's unlocked; the lock itself may change in the same save.
  if (input.description !== undefined && (input.descriptionLocked ?? trip.descriptionLocked)) {
    throw new Error(TRAVEL_ERRORS.blocksLocked)
  }
  checkTimeZone(input.timeZone)
  if (input.coverUrl !== undefined) await checkPicture(userId, input.coverUrl, input.coverCredit, database)
  const { tripId, ...patch } = input
  const values: Partial<TripRow> = { ...patch, updatedAt: now() }
  if (patch.coverUrl === null) values.coverCredit = null
  // A time zone set in Trip settings is the person's own, so a new destination never changes it.
  if (patch.timeZone !== undefined) values.timeZoneGuessed = false
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


/**
 * Delete puts a trip in the bin with everything on it (Tyler, 3 Nov 2026: "A
 * Bin tab"). Nothing on it changes, and Put back returns it to the tab it
 * came from. While it is in the bin it answers like a trip that doesn't
 * exist, its phone calendar stops, and it is off the map of places visited.
 */
export async function binTrip(userId: string, tripId: string, database: CustomShellDb = db) {
  await requireTrip(userId, tripId, database)
  await database.update(travelTrips).set({ deletedAt: now() }).where(eq(travelTrips.id, tripId))
}

/** Puts a trip back from the bin, as it was. */
export async function restoreTrip(userId: string, tripId: string, database: CustomShellDb = db) {
  await requireTrip(userId, tripId, database, { inBin: true })
  await database.update(travelTrips).set({ deletedAt: null }).where(eq(travelTrips.id, tripId))
}

/** Delete for good, from the bin: the trip and everything on it go at once. */
export async function purgeTrip(userId: string, tripId: string, database: CustomShellDb = db) {
  await requireTrip(userId, tripId, database, { inBin: true })
  await removeTripRows([tripId], database)
}

/** Trips in the bin more than 30 days go for good, the next time the Trips table loads. */
export async function emptyTripBin(userId: string, database: CustomShellDb = db, at: Date = new Date()) {
  const cutoff = new Date(at.getTime() - TRIP_BIN_DAYS * 24 * 60 * 60 * 1000)
  const old = await database
    .select({ id: travelTrips.id })
    .from(travelTrips)
    .where(and(eq(travelTrips.ownerUserId, userId), isNotNull(travelTrips.deletedAt), lt(travelTrips.deletedAt, cutoff)))
  await removeTripRows(
    old.map((trip) => trip.id),
    database
  )
}

async function removeTripRows(tripIds: string[], database: CustomShellDb) {
  if (tripIds.length === 0) return
  await database.delete(travelTrips).where(inArray(travelTrips.id, tripIds))
  // The shell's views table can't cascade from a trip, so its views go here.
  await deleteSavedViewsFor({ screens: tripIds.map(tripViewScreen) }, database)
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
    dayPart: null,
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
    mustDo: false,
    photoUrl: null,
    photoCredit: null,
    deletedAt: null,
    createdAt: at,
    updatedAt: at,
  }
}

/**
 * Refuses a place already on the trip, outside the bin, saying where it is
 * (More Travel features part 3; Tyler: "Skip it, say where"). `exceptId` is
 * the card being filled, which never counts against itself.
 */
export async function refuseSamePlace(
  tripId: string,
  card: PlaceLike,
  exceptId: string | null,
  database: Pick<CustomShellDb, "select"> = db
) {
  const rows = await database
    .select({ id: travelActivities.id, title: travelActivities.title, place: travelActivities.place, day: travelActivities.day })
    .from(travelActivities)
    .where(and(eq(travelActivities.tripId, tripId), isNull(travelActivities.deletedAt)))
  const same = findSamePlace(
    card,
    rows.filter((row) => row.id !== exceptId)
  )
  if (same) throw new Error(alreadyOnTripMessage(card.place?.name || card.title, same.day))
}

export async function updateActivity(userId: string, input: UpdateActivityInput, database: CustomShellDb = db) {
  const { activity } = await requireActivity(userId, input.activityId, database)
  await checkTypeId(userId, input.typeId, database)
  // A place picked from Google's search that is already on the trip is skipped (More Travel features part 3).
  // A typed address is the person's own words, and never refused.
  if (input.place?.placeId && input.place.placeId !== activity.place?.placeId) {
    await refuseSamePlace(activity.tripId, { title: activity.title, place: input.place }, activity.id, database)
  }
  if (input.photoUrl !== undefined) await checkPicture(userId, input.photoUrl, input.photoCredit, database)
  const { activityId, ...patch } = input
  const values: Partial<ActivityRow> = { ...patch, updatedAt: now() }
  if (patch.notes !== undefined) values.notes = storedNotes(patch.notes)
  if (patch.photoUrl === null) values.photoCredit = null
  // A part of the day is for a card with no start time: a time, new or kept, clears it (Travel features part 2).
  if ((patch.startTime !== undefined ? patch.startTime : activity.startTime) !== null) values.dayPart = null
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

/**
 * Mass select's Mark done and Mark not done (More Travel features part 12;
 * Tyler: "Mark done / not done"): every ticked card in one request. Cards
 * that aren't the person's, or are in the bin, are skipped and not counted.
 */
export async function markActivitiesDone(
  userId: string,
  input: { activityIds: string[]; done: boolean },
  database: CustomShellDb = db
) {
  const asked = [...new Set(input.activityIds)]
  // One read for every ticked card, kept only when it is on one of the person's trips and in no bin.
  const owned = await database
    .select({ id: travelActivities.id, tripId: travelActivities.tripId })
    .from(travelActivities)
    .innerJoin(travelTrips, eq(travelTrips.id, travelActivities.tripId))
    .where(
      and(
        inArray(travelActivities.id, asked),
        eq(travelTrips.ownerUserId, userId),
        isNull(travelTrips.deletedAt),
        isNull(travelActivities.deletedAt)
      )
    )
  const changed = owned.map((row) => row.id)
  if (changed.length) {
    await database
      .update(travelActivities)
      .set({ done: input.done, updatedAt: now() })
      .where(inArray(travelActivities.id, changed))
  }
  for (const tripId of new Set(owned.map((row) => row.tripId))) await touchTrip(tripId, database)
  return { changed: changed.length, skipped: asked.length - changed.length }
}

async function touchTrip(tripId: string, database: Pick<CustomShellDb, "update">) {
  await database.update(travelTrips).set({ updatedAt: now() }).where(eq(travelTrips.id, tripId))
}
