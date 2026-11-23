import { and, eq } from "drizzle-orm"

import { readLeadView } from "@/lib/dating/leads"
import type { SavedViewValues } from "@/lib/saved-views"
import type { SavedViewScreen } from "@/server/app-options"

import { dateAccounts } from "./schema"

/**
 * Saved views on the Dating dashboard's lead list, `dating:<profile id>` in
 * the shell's saved views, so each profile keeps its own (task
 * "features/06-profiles"). Only the profile's owner may keep views on it. A
 * view keeps what the address keeps about the list (`readLeadView`).
 */
export const datingSavedViewScreen: SavedViewScreen = {
  authorize: async ({ userId, recordId, database }) => {
    const [account] = await database
      .select({ id: dateAccounts.id })
      .from(dateAccounts)
      .where(and(eq(dateAccounts.id, recordId), eq(dateAccounts.userId, userId)))
      .limit(1)
    if (!account) throw new Error("That profile is gone.")
  },
  keep: ({ filters }) => readLeadView(filters) as SavedViewValues,
}
