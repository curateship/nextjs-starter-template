import { and, eq } from "drizzle-orm"

import { SAVED_VIEW_ERRORS } from "@/lib/saved-views"
import {
  MEDIA_SAVED_VIEW_RECORD,
  mediaViewFilters,
  type MediaFilterKind,
} from "@/lib/video/media-saved-views"
import type { SavedViewScreen } from "@/server/app-options"

/**
 * Who may keep saved views on a media filter (the video editor's Media panel
 * or the carousel editor's Image panel), and what a view keeps. Every
 * signed-in person keeps their own on the one `library` record, and the shell
 * already limits each view to its person. A view's collection is named when
 * saved, so a view whose collection was deleted can say which one it was.
 */
export const mediaSavedViewScreen = (kind: MediaFilterKind): SavedViewScreen => ({
  authorize: async ({ recordId }) => {
    if (recordId !== MEDIA_SAVED_VIEW_RECORD) {
      throw new Error(SAVED_VIEW_ERRORS.unknownScreen)
    }
  },
  keep: ({ filters }) => mediaViewFilters(filters, kind),
  namesOf: async ({ userId, filters, database }): Promise<Record<string, string>> => {
    const id = filters.collection
    if (typeof id !== "string" || id === "uncollected") return {}
    // Imported here, not at the top, so the app's options file stays light
    // to load, as its workers are.
    const { videoMediaCollections } = await import("@/server/video/schema")
    const [row] = await database
      .select({ name: videoMediaCollections.name })
      .from(videoMediaCollections)
      .where(
        and(
          eq(videoMediaCollections.id, id),
          eq(videoMediaCollections.userId, userId)
        )
      )
      .limit(1)
    if (!row) throw new Error("That collection no longer exists.")
    return { collection: row.name }
  },
})
