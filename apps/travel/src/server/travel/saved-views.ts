import { and, eq } from "drizzle-orm"

import { keptTripFilters, TRIP_VIEW_KIND } from "@/lib/travel/trip-views"
import type { SavedViewScreen } from "@/server/app-options"
import { requireTrip } from "@/server/travel/access"
import { travelActivityTypes } from "@/server/travel/schema"

/** The shell asks Travel about views on a trip's board: only the trip's owner keeps them. */
export const travelSavedViewScreens: Record<string, SavedViewScreen> = {
  [TRIP_VIEW_KIND]: {
    authorize: async ({ userId, recordId, database }) => {
      await requireTrip(userId, recordId, database)
    },
    keep: ({ filters }) => keptTripFilters(filters),
    namesOf: async ({ userId, filters, database }): Promise<Record<string, string>> => {
      if (typeof filters.type !== "string") return {}
      const [row] = await database
        .select({ name: travelActivityTypes.name })
        .from(travelActivityTypes)
        .where(and(eq(travelActivityTypes.id, filters.type), eq(travelActivityTypes.ownerUserId, userId)))
        .limit(1)
      return row ? { type: row.name } : {}
    },
  },
}
