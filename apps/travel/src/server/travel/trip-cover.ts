import { and, eq, isNull } from "drizzle-orm"

import { db, type CustomShellDb } from "@/server/db"
import { travelTrips } from "@/server/travel/schema"
import { searchPhotos, trackDownload, unsplashEnabled, type UnsplashPhoto } from "@/server/travel/unsplash"

/** Unsplash's search and its "this photo was used" ping. Swapped out in tests. */
export type CoverSource = {
  search: (query: string) => Promise<UnsplashPhoto[]>
  used: (downloadLocation: string) => Promise<void>
}

const unsplash: CoverSource = {
  search: (query) => searchPhotos(query, 1),
  used: trackDownload,
}

/**
 * A new trip's cover (Travel features part 9; Tyler, 3 Nov 2026: "Always, by
 * itself"): the top Unsplash photo of its destination, with the credit
 * Unsplash asks for. Unsplash is told the photo was used before it is set,
 * as its rules ask, the same as picking one by hand. Anything that goes
 * wrong leaves the trip with no cover and never stops it being made, so this
 * says nothing back. A trip that got a cover some other way in the meantime
 * keeps it.
 */
export async function pickTripCover(
  tripId: string,
  destination: string | null | undefined,
  { database = db, source = unsplashEnabled() ? unsplash : null }: { database?: CustomShellDb; source?: CoverSource | null } = {}
) {
  const query = destination?.trim()
  if (!query || !source) return
  try {
    const [photo] = await source.search(query)
    if (!photo) return
    await source.used(photo.downloadLocation)
    await database
      .update(travelTrips)
      .set({ coverUrl: photo.url, coverCredit: photo.credit })
      .where(and(eq(travelTrips.id, tripId), isNull(travelTrips.coverUrl)))
  } catch {
    // No cover is the same as before this existed; Trip settings → Cover photo still works.
  }
}
