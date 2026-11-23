import { and, eq, isNotNull, isNull } from "drizzle-orm"

import { TRAVEL_ERRORS } from "@/lib/travel/errors"
import { db, type CustomShellDb } from "@/server/db"
import { isOwnedImageUrl } from "@/server/media/library"
import { travelActivities, travelTrips } from "@/server/travel/schema"

export type TravelDb = Pick<CustomShellDb, "select" | "insert" | "update" | "delete" | "execute">
export type TripRow = typeof travelTrips.$inferSelect
export type ActivityRow = typeof travelActivities.$inferSelect

/**
 * A trip belongs to the one person who made it, on whichever site they made it
 * from: the check is the account alone (Tyler, 2 Nov 2026: each person sees
 * only their own trips). Someone else's trip answers exactly like one that
 * doesn't exist, so an id can't be used to learn that a trip is there. A
 * trip in the bin answers the same way, except to the bin's own actions
 * (Travel features part 8).
 */
export async function requireTrip(
  userId: string,
  tripId: string,
  database: TravelDb = db,
  { inBin = false }: { inBin?: boolean } = {}
) {
  const [trip] = await database
    .select()
    .from(travelTrips)
    .where(
      and(
        eq(travelTrips.id, tripId),
        eq(travelTrips.ownerUserId, userId),
        inBin ? isNotNull(travelTrips.deletedAt) : isNull(travelTrips.deletedAt)
      )
    )
    .limit(1)
  if (!trip) throw new Error(TRAVEL_ERRORS.tripNotFound)
  return trip
}

/** An activity on one of the person's own trips, not in the bin unless asked. */
export async function requireActivity(
  userId: string,
  activityId: string,
  database: TravelDb = db,
  { inBin = false }: { inBin?: boolean } = {}
) {
  const [row] = await database
    .select({ activity: travelActivities, trip: travelTrips })
    .from(travelActivities)
    .innerJoin(travelTrips, eq(travelTrips.id, travelActivities.tripId))
    .where(
      and(
        eq(travelActivities.id, activityId),
        eq(travelTrips.ownerUserId, userId),
        isNull(travelTrips.deletedAt),
        inBin ? undefined : isNull(travelActivities.deletedAt)
      )
    )
    .limit(1)
  if (!row) throw new Error(TRAVEL_ERRORS.activityNotFound)
  return row
}

const UNSPLASH_IMAGE = /^https:\/\/images\.unsplash\.com\/[A-Za-z0-9\-_/.?=&%]+$/

/**
 * A picture on a trip or an activity is either one the person uploaded to
 * their own media library, or an Unsplash photo with its credit. Anything
 * else is refused, so a page can never be made to load an address someone
 * typed in.
 */
export async function checkPicture(
  userId: string,
  url: string | null | undefined,
  credit: unknown,
  database: TravelDb = db
) {
  if (!url) return
  if (UNSPLASH_IMAGE.test(url)) {
    if (!credit) throw new Error(TRAVEL_ERRORS.pictureNeedsCredit)
    return
  }
  if (!(await isOwnedImageUrl(userId, url, database))) {
    throw new Error(TRAVEL_ERRORS.pictureNotYours)
  }
}
