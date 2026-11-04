import { and, eq } from "drizzle-orm"

import { ARCHIVE_VIEW_KIND, keptArchiveFilters } from "@/lib/archive/search"
import type { SavedViewScreen } from "@/server/app-options"
import { promoProjects } from "@/server/social/schema"

/** Views on a project's archive: only the project's owner keeps them. */
export const archiveSavedViewScreens: Record<string, SavedViewScreen> = {
  [ARCHIVE_VIEW_KIND]: {
    authorize: async ({ userId, recordId, database }) => {
      const [project] = await database
        .select({ id: promoProjects.id })
        .from(promoProjects)
        .where(and(eq(promoProjects.id, recordId), eq(promoProjects.userId, userId)))
        .limit(1)
      if (!project) throw new Error("That project is not there any more.")
    },
    keep: ({ filters }) => keptArchiveFilters(filters),
  },
}
