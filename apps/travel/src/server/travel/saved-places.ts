import { and, asc, count, desc, eq, isNull } from "drizzle-orm"

import type { Place } from "@/lib/travel/rules"

import { TRAVEL_ERRORS } from "@/lib/travel/errors"
import { copiedNotes } from "@/lib/travel/notes"
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

export type SavedPlace = Omit<typeof travelSavedPlaces.$inferSelect, "ownerUserId" | "createdAt"> & {
  createdAt: string
}

export async function listSavedPlaces(userId: string, database: Pick<CustomShellDb, "select"> = db): Promise<SavedPlace[]> {
  const rows = await database
    .select()
    .from(travelSavedPlaces)
    .where(eq(travelSavedPlaces.ownerUserId, userId))
    .orderBy(desc(travelSavedPlaces.createdAt))
  return rows.map(({ ownerUserId: _owner, createdAt, ...rest }) => ({ ...rest, createdAt: createdAt.toISOString() }))
}

export async function saveActivityAsPlace(userId: string, activityId: string, database: CustomShellDb = db) {
  const { activity } = await requireActivity(userId, activityId, database)
  const [held] = await database
    .select({ value: count() })
    .from(travelSavedPlaces)
    .where(eq(travelSavedPlaces.ownerUserId, userId))
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
    notes: copiedNotes(activity.notes),
    photoUrl: activity.photoUrl,
    photoCredit: activity.photoCredit,
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
 * its notes keep no Place or Map block.
 */
export async function updateSavedPlace(userId: string, input: SavedPlacePatch, database: CustomShellDb = db) {
  const [saved] = await database
    .select({ id: travelSavedPlaces.id })
    .from(travelSavedPlaces)
    .where(and(eq(travelSavedPlaces.id, input.savedPlaceId), eq(travelSavedPlaces.ownerUserId, userId)))
    .limit(1)
  if (!saved) throw new Error(TRAVEL_ERRORS.savedPlaceNotFound)
  if (input.typeId !== undefined) await checkTypeId(userId, input.typeId, database)
  if (input.photoUrl !== undefined) await checkPicture(userId, input.photoUrl, input.photoCredit, database)
  const { savedPlaceId, ...patch } = input
  const values: Partial<typeof travelSavedPlaces.$inferInsert> = { ...patch }
  if (patch.notes !== undefined) values.notes = copiedNotes(patch.notes)
  if (patch.photoUrl !== undefined) values.photoCredit = patch.photoUrl ? (patch.photoCredit ?? null) : null
  if (Object.keys(values).length === 0) return
  await database.update(travelSavedPlaces).set(values).where(eq(travelSavedPlaces.id, savedPlaceId))
}

export async function deleteSavedPlace(userId: string, savedPlaceId: string, database: CustomShellDb = db) {
  const deleted = await database
    .delete(travelSavedPlaces)
    .where(and(eq(travelSavedPlaces.id, savedPlaceId), eq(travelSavedPlaces.ownerUserId, userId)))
    .returning({ id: travelSavedPlaces.id })
  if (deleted.length === 0) throw new Error(TRAVEL_ERRORS.savedPlaceNotFound)
}

/** A copy of a saved place at the end of a trip's Ideas column. */
export async function addSavedPlaceToTrip(
  userId: string,
  input: { tripId: string; savedPlaceId: string },
  database: CustomShellDb = db
) {
  const trip = await requireTrip(userId, input.tripId, database)
  const [saved] = await database
    .select()
    .from(travelSavedPlaces)
    .where(and(eq(travelSavedPlaces.id, input.savedPlaceId), eq(travelSavedPlaces.ownerUserId, userId)))
    .limit(1)
  if (!saved) throw new Error(TRAVEL_ERRORS.savedPlaceNotFound)
  await refuseSamePlace(trip.id, saved, null, database)
  const live = await database
    .select({ id: travelActivities.id, day: travelActivities.day })
    .from(travelActivities)
    .where(and(eq(travelActivities.tripId, trip.id), isNull(travelActivities.deletedAt)))
    .orderBy(asc(travelActivities.position))
  if (live.length >= MAX_ACTIVITIES) throw new Error(TRAVEL_ERRORS.tooManyActivities)
  const id = uuid()
  await database.insert(travelActivities).values({
    ...blankActivity(trip.id, now()),
    id,
    day: null,
    position: live.filter((activity) => activity.day === null).length,
    title: saved.title,
    typeId: saved.typeId,
    place: saved.place,
    website: saved.website,
    menuUrl: saved.menuUrl,
    phone: saved.phone,
    notes: copiedNotes(saved.notes),
    photoUrl: saved.photoUrl,
    photoCredit: saved.photoCredit,
  })
  return { id }
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
 * A copy of a Go again place at the end of a trip's Ideas column, made the
 * way a saved place is copied: its name, type, place, links, notes and
 * picture, and nothing of how it went. A place already on the trip makes no
 * copy (More Travel features part 3).
 */
export async function addGoAgainToTrip(
  userId: string,
  input: { tripId: string; activityId: string },
  database: CustomShellDb = db
) {
  const trip = await requireTrip(userId, input.tripId, database)
  const { activity } = await requireActivity(userId, input.activityId, database)
  if (!activity.goAgain) throw new Error(TRAVEL_ERRORS.activityNotFound)
  await refuseSamePlace(trip.id, activity, null, database)
  const live = await database
    .select({ day: travelActivities.day })
    .from(travelActivities)
    .where(and(eq(travelActivities.tripId, trip.id), isNull(travelActivities.deletedAt)))
  if (live.length >= MAX_ACTIVITIES) throw new Error(TRAVEL_ERRORS.tooManyActivities)
  const id = uuid()
  await database.insert(travelActivities).values({
    ...blankActivity(trip.id, now()),
    id,
    day: null,
    position: live.filter((row) => row.day === null).length,
    title: activity.title,
    typeId: activity.typeId,
    place: activity.place,
    website: activity.website,
    menuUrl: activity.menuUrl,
    phone: activity.phone,
    notes: copiedNotes(activity.notes),
    photoUrl: activity.photoUrl,
    photoCredit: activity.photoCredit,
  })
  return { id }
}
