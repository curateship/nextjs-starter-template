import { createServerFn } from "@tanstack/react-start"
import { and, eq, ne } from "drizzle-orm"

import { datingSettingsShape, type DatingSettings } from "@/lib/dating/settings"
import { readDatingSettings, saveDatingSettings } from "@/server/dating/settings"
import { inWords } from "@/server/dating/words"
import { db } from "@/server/db"
import { userGet, userPost } from "@/server/guards"
import { dateMatches } from "@/server/tinder/schema"
import { workspaceIdForRequest } from "@/server/workspaces/for-request"

/** Settings → App settings → Dating: read once per page, saved whole on every change. */

const loadFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }): Promise<DatingSettings> =>
    inWords(async () => readDatingSettings(context.user.id, await workspaceIdForRequest(context.user.id)))
  )

export function loadDatingSettings() {
  return loadFn()
}

const saveFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(datingSettingsShape)
  .handler(async ({ data, context }): Promise<DatingSettings> =>
    inWords(async () => {
      const workspaceId = await workspaceIdForRequest(context.user.id)
      const before = await readDatingSettings(context.user.id, workspaceId)
      const saved = await saveDatingSettings(context.user.id, workspaceId, data)
      // Automate switched off: drafts keep their words but lose their send
      // time, so switching it on again later never sends an old draft at once.
      if (before.automate && !saved.automate) {
        await db
          .update(dateMatches)
          .set({ draftSendAt: null })
          .where(and(eq(dateMatches.userId, context.user.id), eq(dateMatches.workspaceId, workspaceId), ne(dateMatches.draft, "")))
      }
      return saved
    })
  )

export function saveDatingSettingsNow(values: DatingSettings) {
  return saveFn({ data: values })
}
