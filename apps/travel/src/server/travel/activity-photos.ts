import { and, asc, eq, inArray, isNull } from "drizzle-orm"

import { TRAVEL_ERRORS } from "@/lib/travel/errors"
import type { PhotoCredit } from "@/lib/travel/rules"
import { now, uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { checkPicture, requireActivity, type TravelDb } from "@/server/travel/access"
import { travelActivities, travelActivityPhotos } from "@/server/travel/schema"

/** The most photos one card holds, its own picture included. */
export const MAX_CARD_PHOTOS = 30

/** One photo in a card's row. */
export type CardPhoto = { url: string; credit: PhotoCredit | null }

/** A card's photos after its first, as the trip page holds them. */
export type ActivityPhoto = CardPhoto & { activityId: string }

/** Every card's photos after its first, for one trip, in each row's order. Cards in the bin are left out. */
export async function listTripPhotos(tripId: string, database: Pick<CustomShellDb, "select"> = db): Promise<ActivityPhoto[]> {
  return database
    .select({ activityId: travelActivityPhotos.activityId, url: travelActivityPhotos.url, credit: travelActivityPhotos.credit })
    .from(travelActivityPhotos)
    .innerJoin(travelActivities, eq(travelActivities.id, travelActivityPhotos.activityId))
    .where(and(eq(travelActivities.tripId, tripId), isNull(travelActivities.deletedAt)))
    .orderBy(asc(travelActivityPhotos.activityId), asc(travelActivityPhotos.position))
}

/**
 * Sets a card's whole row of photos at once, in order (Travel features 3,
 * part 5): adding, removing and reordering are all this one save. The first
 * becomes the card's own picture, the one the board shows, and the rest are
 * kept in order behind it. Each one is checked the same way as the card's
 * picture: uploaded by this person, or from Unsplash with its credit.
 */
export async function setActivityPhotos(
  userId: string,
  input: { activityId: string; photos: CardPhoto[] },
  database: CustomShellDb = db
) {
  const { activity } = await requireActivity(userId, input.activityId, database)
  if (input.photos.length > MAX_CARD_PHOTOS) throw new Error(TRAVEL_ERRORS.tooManyPhotos)
  for (const photo of input.photos) await checkPicture(userId, photo.url, photo.credit, database)
  const [first, ...rest] = input.photos
  const at = now()
  await database.transaction(async (tx) => {
    await tx
      .update(travelActivities)
      .set({ photoUrl: first?.url ?? null, photoCredit: first?.credit ?? null, updatedAt: at })
      .where(eq(travelActivities.id, activity.id))
    await tx.delete(travelActivityPhotos).where(eq(travelActivityPhotos.activityId, activity.id))
    if (rest.length) {
      await tx.insert(travelActivityPhotos).values(
        rest.map((photo, position) => ({
          id: uuid(),
          activityId: activity.id,
          url: photo.url,
          credit: photo.credit,
          position,
          createdAt: at,
        }))
      )
    }
  })
}

/** Copies each card's extra photos onto its copy, for Copy trip, Copy day and Duplicate. `ids` maps old card to copy. */
export async function copyActivityPhotos(ids: ReadonlyMap<string, string>, database: TravelDb) {
  if (!ids.size) return
  const rows = await database
    .select()
    .from(travelActivityPhotos)
    .where(inArray(travelActivityPhotos.activityId, [...ids.keys()]))
  if (!rows.length) return
  const at = now()
  await database.insert(travelActivityPhotos).values(
    rows.map((row) => ({ ...row, id: uuid(), activityId: ids.get(row.activityId)!, createdAt: at }))
  )
}
