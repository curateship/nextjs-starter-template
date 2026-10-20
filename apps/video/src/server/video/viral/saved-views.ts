import type { SavedViewScreen } from "@/server/app-options"
import { viralViewFilters } from "@/lib/video/viral-saved-views"

/**
 * Who may keep saved views on a Viral project, and what a view keeps: the
 * project's owner, and the middle panel's search, filters and sort
 * (`src/lib/video/viral-saved-views.ts`). A view naming a keyword that has
 * since been removed says so when it is opened, on the screen.
 */
export const viralSavedViewScreen: SavedViewScreen = {
  authorize: async ({ userId, recordId }) => {
    // Imported here, not at the top, so the app's options file stays light
    // to load, as its workers are.
    const { requireOwnedViralProject } = await import("@/server/video/viral/projects")
    await requireOwnedViralProject(userId, recordId)
  },
  keep: ({ filters }) => viralViewFilters(filters),
}
