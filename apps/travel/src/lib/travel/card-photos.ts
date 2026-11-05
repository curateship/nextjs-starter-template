import type { PhotoCredit } from "@/lib/travel/rules"

/** One photo in a card's row. */
export type RowPhoto = { url: string; credit: PhotoCredit | null }

/**
 * A card's photos in its row's order (Travel features 3, part 5): its own
 * picture first, the one the board shows, then the rest kept for it.
 */
export function cardPhotos(
  activity: { id: string; photoUrl: string | null; photoCredit: PhotoCredit | null },
  extra: readonly (RowPhoto & { activityId: string })[]
): RowPhoto[] {
  const rest = extra.filter((photo) => photo.activityId === activity.id).map(({ url, credit }) => ({ url, credit }))
  return activity.photoUrl ? [{ url: activity.photoUrl, credit: activity.photoCredit }, ...rest] : rest
}
