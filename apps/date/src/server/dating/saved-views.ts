import { readLeadView } from "@/lib/dating/leads"
import type { SavedViewValues } from "@/lib/saved-views"
import type { SavedViewScreen } from "@/server/app-options"

/**
 * Saved views on the Dating dashboard's lead list, `dating:` in the shell's
 * saved views. The dashboard is the member's own, so the screen key names no
 * record and every signed-in member may keep views on it. A view keeps what
 * the address keeps about the list (`readLeadView`).
 */
export const datingSavedViewScreen: SavedViewScreen = {
  authorize: async ({ recordId }) => {
    if (recordId !== "") throw new Error("That is not the Dating dashboard.")
  },
  keep: ({ filters }) => readLeadView(filters) as SavedViewValues,
}
