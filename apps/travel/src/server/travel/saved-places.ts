import { and, asc, count, desc, eq, inArray, isNotNull, isNull, lt } from "drizzle-orm"

import type { Place } from "@/lib/travel/rules"

import { TRAVEL_ERRORS } from "@/lib/travel/errors"
import { TRIP_BIN_DAYS } from "@/lib/travel/trip-bin"
import { copiedNotes, savedPlaceNotes } from "@/lib/travel/notes"
import { now, uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { checkPicture, requireActivity, requireTrip } from "@/server/travel/access"
import { travelActivities, travelSavedPlaces, travelTrips } from "@/server/travel/schema"
import { blankActivity, MAX_ACTIVITIES, refuseSamePlace } from "@/server/travel/trips"
import { checkTypeId } from "@/server/travel/types"

/**
 * Saved places (task part 41): a person's favourite restaurants, hotels and
 * sights, kept apart from any trip. Saving copies an activity's address,
 * type, links, notes and picture. Adding one to a trip copies it again into
 * the trip's Ideas column, so the two are separate records from then on and
 * editing one never changes the other.
 */

const MAX_SAVED_PLACES = 500

export type SavedPlace = Omit<typeof travelSavedPlaces.$inferSelect, "ownerUserId" | "createdAt" | "deletedAt"> & {
  createdAt: string
  /** When it went into Places' bin, or null. */
  deletedAt: string | null
}

function toSavedPlace({ ownerUserId: _owner, createdAt, deletedAt, ...rest }: typeof travelSavedPlaces.$inferSelect): SavedPlace {
  return { ...rest, createdAt: createdAt.toISOString(), deletedAt: deletedAt?.toISOString() ?? null }
}

/** The person's saved places, newest first: the ones in use, or with `inBin` the ones in Places' bin. */
export async function listSavedPlaces(
  userId: string,
  database: Pick<CustomShellDb, "select"> = db,
  { inBin = false }: { inBin?: boolean } = {}
): Promise<SavedPlace[]> {
  const rows = await database
    .select()
    .from(travelSavedPlaces)
    .where(
      and(
        eq(travelSavedPlaces.ownerUserId, userId),
        inBin ? isNotNull(travelSavedPlaces.deletedAt) : isNull(travelSavedPlaces.deletedAt)
      )
    )
    .orderBy(desc(inBin ? travelSavedPlaces.deletedAt : travelSavedPlaces.createdAt))
  return rows.map(toSavedPlace)
}

/** The ids of these saved places that are the person's, in the bin or out of it as asked. */
async function ownSavedPlaceIds(userId: string, ids: string[], inBin: boolean, database: Pick<CustomShellDb, "select">) {
  const rows = await database
    .select({ id: travelSavedPlaces.id })
    .from(travelSavedPlaces)
    .where(
      and(
        eq(travelSavedPlaces.ownerUserId, userId),
        inArray(travelSavedPlaces.id, ids),
        inBin ? isNotNull(travelSavedPlaces.deletedAt) : isNull(travelSavedPlaces.deletedAt)
      )
    )
  return rows.map((row) => row.id)
}

/**
 * Mass select's changes and a row's bin, in one request each: into Places'
 * bin, back out of it, or gone for good from it. Answers with the ids changed
 * and the ids skipped (not the person's, or not where the change needs them).
 */
export async function changeSavedPlaces(
  userId: string,
  input: { ids: string[]; change: "bin" | "restore" | "purge" },
  database: CustomShellDb = db
) {
  const done = await ownSavedPlaceIds(userId, input.ids, input.change !== "bin", database)
  if (done.length) {
    if (input.change === "purge") await database.delete(travelSavedPlaces).where(inArray(travelSavedPlaces.id, done))
    else
      await database
        .update(travelSavedPlaces)
        .set({ deletedAt: input.change === "bin" ? now() : null })
        .where(inArray(travelSavedPlaces.id, done))
  }
  return { done, skipped: input.ids.filter((id) => !done.includes(id)) }
}

/** Saved places in the bin more than 30 days go for good, the next time Places loads. */
export async function emptySavedPlacesBin(userId: string, database: CustomShellDb = db, at: Date = new Date()) {
  const cutoff = new Date(at.getTime() - TRIP_BIN_DAYS * 24 * 60 * 60 * 1000)
  await database
    .delete(travelSavedPlaces)
    .where(
      and(
        eq(travelSavedPlaces.ownerUserId, userId),
        isNotNull(travelSavedPlaces.deletedAt),
        lt(travelSavedPlaces.deletedAt, cutoff)
      )
    )
}

export async function saveActivityAsPlace(userId: string, activityId: string, database: CustomShellDb = db) {
  const { activity } = await requireActivity(userId, activityId, database)
  const [held] = await database
    .select({ value: count() })
    .from(travelSavedPlaces)
    .where(and(eq(travelSavedPlaces.ownerUserId, userId), isNull(travelSavedPlaces.deletedAt)))
  if ((held?.value ?? 0) >= MAX_SAVED_PLACES) throw new Error(TRAVEL_ERRORS.tooManySavedPlaces)
  const id = uuid()
  await database.insert(travelSavedPlaces).values({
    id,
    ownerUserId: userId,
    title: activity.title,
    typeId: activity.typeId,
    place: activity.place,
    website: activity.website,
    menuUrl: activity.menuUrl,
    phone: activity.phone,
    notes: savedPlaceNotes(activity.notes),
    photoUrl: activity.photoUrl,
    photoCredit: activity.photoCredit,
    createdAt: now(),
  })
  return { id }
}

/**
 * A new saved place from the Trips dashboard's New place (12 Nov 2026): its
 * name, type, and the place picked from Google with its website and phone
 * when Google had them.
 */
export async function createSavedPlace(
  userId: string,
  input: { title: string; typeId: string | null; place: Place | null; website: string | null; phone: string | null },
  database: CustomShellDb = db
) {
  const [held] = await database
    .select({ value: count() })
    .from(travelSavedPlaces)
    .where(and(eq(travelSavedPlaces.ownerUserId, userId), isNull(travelSavedPlaces.deletedAt)))
  if ((held?.value ?? 0) >= MAX_SAVED_PLACES) throw new Error(TRAVEL_ERRORS.tooManySavedPlaces)
  await checkTypeId(userId, input.typeId, database)
  const id = uuid()
  await database.insert(travelSavedPlaces).values({
    id,
    ownerUserId: userId,
    title: input.title,
    typeId: input.typeId,
    place: input.place,
    website: input.website,
    menuUrl: null,
    phone: input.phone,
    notes: "",
    photoUrl: null,
    photoCredit: null,
    createdAt: now(),
  })
  return { id }
}

export type SavedPlacePatch = {
  savedPlaceId: string
  title?: string
  typeId?: string | null
  /** The editor's own document as JSON text; the server cleans it. */
  notes?: string
  photoUrl?: string | null
  photoCredit?: SavedPlace["photoCredit"]
}

/**
 * Changes a saved place's name, type, notes or picture (Travel features 4,
 * part 11; Tyler, 6 Nov 2026: "Opens in the window"). Copies already added to
 * a trip are their own and don't change. A saved place belongs to no trip, so
 * its notes keep no Place, Map or Budget block.
 */
export async function updateSavedPlace(userId: string, input: SavedPlacePatch, database: CustomShellDb = db) {
  const [saved] = await database
    .select({ id: travelSavedPlaces.id })
    .from(travelSavedPlaces)
    .where(
      and(
        eq(travelSavedPlaces.id, input.savedPlaceId),
        eq(travelSavedPlaces.ownerUserId, userId),
        isNull(travelSavedPlaces.deletedAt)
      )
    )
    .limit(1)
  if (!saved) throw new Error(TRAVEL_ERRORS.savedPlaceNotFound)
  if (input.typeId !== undefined) await checkTypeId(userId, input.typeId, database)
  if (input.photoUrl !== undefined) await checkPicture(userId, input.photoUrl, input.photoCredit, database)
  const { savedPlaceId, ...patch } = input
  const values: Partial<typeof travelSavedPlaces.$inferInsert> = { ...patch }
  if (patch.notes !== undefined) values.notes = savedPlaceNotes(patch.notes)
  if (patch.photoUrl !== undefined) values.photoCredit = patch.photoUrl ? (patch.photoCredit ?? null) : null
  if (Object.keys(values).length === 0) return
  await database.update(travelSavedPlaces).set(values).where(eq(travelSavedPlaces.id, savedPlaceId))
}

/** What a copy into a trip takes from a saved place or a Go again place. */
type CopiedPlace = Pick<
  typeof travelSavedPlaces.$inferSelect,
  "title" | "typeId" | "place" | "website" | "menuUrl" | "phone" | "notes" | "photoUrl" | "photoCredit"
>

/**
 * A copy of a place at the end of one of the trip's days, or of its Ideas
 * column when `day` is null (the Trips dashboard's Add to a trip; Tyler,
 * 12 Nov 2026). A place already on the trip makes no copy (More Travel
 * features part 3). The copy is the trip's own from then on.
 */
async function copyIntoTrip(
  trip: Awaited<ReturnType<typeof requireTrip>>,
  day: number | null,
  source: CopiedPlace,
  database: CustomShellDb
) {
  if (day !== null && (day < 1 || day > trip.days)) throw new Error(TRAVEL_ERRORS.dayOutOfRange)
  await refuseSamePlace(trip.id, source, null, database)
  const live = await database
    .select({ day: travelActivities.day })
    .from(travelActivities)
    .where(and(eq(travelActivities.tripId, trip.id), isNull(travelActivities.deletedAt)))
  if (live.length >= MAX_ACTIVITIES) throw new Error(TRAVEL_ERRORS.tooManyActivities)
  const id = uuid()
  await database.insert(travelActivities).values({
    ...blankActivity(trip.id, now()),
    id,
    day,
    position: live.filter((row) => row.day === day).length,
    title: source.title,
    typeId: source.typeId,
    place: source.place,
    website: source.website,
    menuUrl: source.menuUrl,
    phone: source.phone,
    notes: copiedNotes(source.notes),
    photoUrl: source.photoUrl,
    photoCredit: source.photoCredit,
  })
  return { id }
}

/** A copy of a saved place on a trip: at the end of `day`, or of Ideas when it is null or left out. */
export async function addSavedPlaceToTrip(
  userId: string,
  input: { tripId: string; savedPlaceId: string; day?: number | null },
  database: CustomShellDb = db
) {
  // The trip is checked first, so someone else's trip says so whatever is being added.
  const trip = await requireTrip(userId, input.tripId, database)
  const [saved] = await database
    .select()
    .from(travelSavedPlaces)
    .where(
      and(
        eq(travelSavedPlaces.id, input.savedPlaceId),
        eq(travelSavedPlaces.ownerUserId, userId),
        isNull(travelSavedPlaces.deletedAt)
      )
    )
    .limit(1)
  if (!saved) throw new Error(TRAVEL_ERRORS.savedPlaceNotFound)
  return copyIntoTrip(trip, input.day ?? null, saved, database)
}

/** One place ticked "Would go again", with the trip and day it was on (More Travel features part 14). */
export type GoAgainPlace = {
  id: string
  title: string
  place: Place | null
  photoUrl: string | null
  tripId: string
  tripName: string
  day: number | null
}

/** The most Go again lists, so a long-time traveller's window stays quick to open. */
const GO_AGAIN_MAX = 500

/**
 * Every place the person ticked "Would go again", on any of their trips not
 * in the bin, newest trip first (Tyler: "Tab in Saved places", "Ticked
 * only"). Cards in a trip's bin are left out.
 */
export async function listGoAgain(userId: string, database: Pick<CustomShellDb, "select"> = db): Promise<GoAgainPlace[]> {
  return database
    .select({
      id: travelActivities.id,
      title: travelActivities.title,
      place: travelActivities.place,
      photoUrl: travelActivities.photoUrl,
      tripId: travelTrips.id,
      tripName: travelTrips.name,
      day: travelActivities.day,
    })
    .from(travelActivities)
    .innerJoin(travelTrips, eq(travelTrips.id, travelActivities.tripId))
    .where(
      and(
        eq(travelTrips.ownerUserId, userId),
        isNull(travelTrips.deletedAt),
        isNull(travelActivities.deletedAt),
        eq(travelActivities.goAgain, true)
      )
    )
    .orderBy(desc(travelTrips.createdAt), asc(travelActivities.day), asc(travelActivities.position))
    .limit(GO_AGAIN_MAX)
}

/**
 * A copy of a Go again place on a trip, made the way a saved place is copied:
 * its name, type, place, links, notes and picture, and nothing of how it went.
 */
export async function addGoAgainToTrip(
  userId: string,
  input: { tripId: string; activityId: string; day?: number | null },
  database: CustomShellDb = db
) {
  const trip = await requireTrip(userId, input.tripId, database)
  const { activity } = await requireActivity(userId, input.activityId, database)
  if (!activity.goAgain) throw new Error(TRAVEL_ERRORS.activityNotFound)
  return copyIntoTrip(trip, input.day ?? null, activity, database)
}
