import type { SavedViewScreen } from "@/server/app-options"
import { libraryFilters } from "@/lib/viral/library"
import { textPostsViewFilters } from "@/lib/viral/text-posts"
import { vaultViewFilters } from "@/lib/viral/vault-saved-views"
import { viralViewFilters } from "@/lib/viral/viral-saved-views"

/**
 * Who may keep saved views on a Viral project, and what a view keeps: the
 * project's owner, and the middle panel's search, filters and sort
 * (`src/lib/viral/viral-saved-views.ts`). A view naming a keyword that has
 * since been removed says so when it is opened, on the screen.
 */
export const viralSavedViewScreen: SavedViewScreen = {
  authorize: async ({ userId, recordId }) => {
    // Imported here, not at the top, so the app's options file stays light
    // to load, as its workers are.
    const { requireOwnedViralProject } = await import("@/server/viral/projects")
    await requireOwnedViralProject(userId, recordId)
  },
  keep: ({ filters }) => viralViewFilters(filters),
}

/**
 * The Vault page's saved views (`src/lib/viral/vault-saved-views.ts`). The
 * page is every project's vault, so there is no record to check: a view is
 * its owner's alone, and what it names is checked when it is opened.
 */
export const vaultSavedViewScreen: SavedViewScreen = {
  authorize: async ({ recordId }) => {
    if (recordId) throw new Error("The Vault page's views name no record.")
  },
  keep: ({ filters }) => vaultViewFilters(filters),
}

/**
 * The Library page's saved views on its Hooks tab (`src/lib/viral/library.ts`).
 * Like the Vault page, there is no record: a view is its owner's alone.
 */
export const librarySavedViewScreen: SavedViewScreen = {
  authorize: async ({ recordId }) => {
    if (recordId) throw new Error("The Library page's views name no record.")
  },
  keep: ({ filters }) => libraryFilters(filters),
}

/**
 * Saved views on a project's X, Reddit and LinkedIn list
 * (`src/lib/viral/text-posts.ts`): the project's owner only, like the video
 * list's, but a kind of their own so the two lists never share one menu.
 */
export const textPostsSavedViewScreen: SavedViewScreen = {
  authorize: async ({ userId, recordId }) => {
    const { requireOwnedViralProject } = await import("@/server/viral/projects")
    await requireOwnedViralProject(userId, recordId)
  },
  keep: ({ filters }) => textPostsViewFilters(filters),
}
