import { createServerFn } from "@tanstack/react-start"
import { and, eq, ne } from "drizzle-orm"

import { datingSettingsShape, type DatingSettings } from "@/lib/dating/settings"
import { requestAccount } from "@/server/dating/accounts"
import { readDatingSettings, saveDatingSettings } from "@/server/dating/settings"
import { inWords } from "@/server/dating/words"
import { db } from "@/server/db"
import { userGet, userPost } from "@/server/guards"
import { dateAccounts } from "@/server/dating/schema"
import { dateMatches } from "@/server/tinder/schema"

/** The open profile's Dating settings: read once per page, saved whole on every change. */

const loadFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }): Promise<DatingSettings> =>
    inWords(async () => readDatingSettings((await requestAccount(context.user.id)).id))
  )

export function loadDatingSettings() {
  return loadFn()
}

const saveFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(datingSettingsShape)
  .handler(async ({ data, context }): Promise<DatingSettings> =>
    inWords(async () => {
      const account = await requestAccount(context.user.id)
      const before = await readDatingSettings(account.id)
      const saved = await saveDatingSettings(account, data)
      // Automate switched off: drafts keep their words but lose their send
      // time, so switching it on again later never sends an old draft at once.
      if (before.automate && !saved.automate) {
        await db
          .update(dateMatches)
          .set({ draftSendAt: null })
          .where(and(eq(dateMatches.accountId, account.id), ne(dateMatches.draft, "")))
      }
      // The app's own filters follow Date's: the phone sets them on its next free pass.
      const filtersChanged = before.maxDistanceKm !== saved.maxDistanceKm || before.ageMin !== saved.ageMin || before.ageMax !== saved.ageMax
      if (filtersChanged) await db.update(dateAccounts).set({ discoveryOwed: true }).where(eq(dateAccounts.id, account.id))
      return saved
    })
  )

export function saveDatingSettingsNow(values: DatingSettings) {
  return saveFn({ data: values })
}
