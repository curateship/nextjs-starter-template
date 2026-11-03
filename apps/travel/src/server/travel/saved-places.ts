import { and, asc, count, desc, eq, isNull } from "drizzle-orm"

import { TRAVEL_ERRORS } from "@/lib/travel/errors"
import { now, uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { requireActivity, requireTrip } from "@/server/travel/access"
import { travelActivities, travelSavedPlaces } from "@/server/travel/schema"
import { blankActivity, MAX_ACTIVITIES } from "@/server/travel/trips"

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
    notes: activity.notes,
    photoUrl: activity.photoUrl,
    photoCredit: activity.photoCredit,
    createdAt: now(),
  })
  return { id }
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
    notes: saved.notes,
    photoUrl: saved.photoUrl,
    photoCredit: saved.photoCredit,
  })
  return { id }
}
