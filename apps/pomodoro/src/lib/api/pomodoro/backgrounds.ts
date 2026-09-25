import { createServerFn } from "@tanstack/react-start"
import { eq } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/server/db"
import { userGet, userPost } from "@/server/guards"
import { loadPomodoroEntitlements } from "@/server/pomodoro/entitlements"
import { loadOrCreatePreferences } from "@/server/pomodoro/productivity"
import {
  assertUploadUsable,
  resolveUploadUrl,
} from "@/server/pomodoro/media-uploads"
import { userPreferences } from "@/server/pomodoro/schema"
import {
  curatedBackgrounds,
  parseBackgroundReference,
} from "@/lib/pomodoro/background-catalog"

/**
 * The chosen background: one of the eight scenes, or one of this person's own
 * uploads. Saving a Pro scene on a free account is refused
 * (UPGRADE_REQUIRED:premiumMedia), and an upload has to be theirs and ready.
 */

const loadBackgroundFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }) => {
    const [preferences, entitlements] = await Promise.all([
      loadOrCreatePreferences(context.user.id),
      loadPomodoroEntitlements(context.user.id),
    ])
    // An upload is served from the bucket, so the address is resolved here
    // rather than built in the browser. A selection that is not theirs any
    // more, or not finished, comes back with no address and the backdrop falls
    // back to the default scene.
    const reference = parseBackgroundReference(preferences.selectedBackground)
    const upload =
      reference?.type === "media"
        ? await resolveUploadUrl(context.user.id, reference.mediaId)
        : null

    return {
      selectedBackground: preferences.selectedBackground,
      canUsePremiumMedia: entitlements.canUsePremiumMedia,
      selectedUploadUrl: upload?.url ?? null,
      selectedUploadKind: upload?.kind ?? null,
    }
  })

const saveBackgroundFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ selectedBackground: z.string().max(60).nullable() }))
  .handler(async ({ data, context }) => {
    const reference =
      data.selectedBackground === null
        ? null
        : parseBackgroundReference(data.selectedBackground)
    if (data.selectedBackground !== null && !reference)
      throw new Error("UNKNOWN_BACKGROUND")
    if (reference?.type === "scene") {
      const scene = curatedBackgrounds.find(
        (entry) => entry.key === reference.key
      )
      if (scene?.locked) {
        const entitlements = await loadPomodoroEntitlements(context.user.id)
        if (!entitlements.canUsePremiumMedia)
          throw new Error("UPGRADE_REQUIRED:premiumMedia")
      }
    }
    // An upload has to be this person's own and finished being prepared.
    // Without this check the address bar could put somebody else's media id in
    // the preference — the file itself would still refuse to load, but the row
    // would be holding an id that is not theirs.
    if (reference?.type === "media") {
      await assertUploadUsable(context.user.id, reference.mediaId, "background")
    }
    await loadOrCreatePreferences(context.user.id)
    const [updated] = await db
      .update(userPreferences)
      .set({
        selectedBackground: data.selectedBackground,
        updatedAt: new Date(),
      })
      .where(eq(userPreferences.userId, context.user.id))
      .returning({ selectedBackground: userPreferences.selectedBackground })
    return updated
  })

export const loadBackgroundPreference = () => loadBackgroundFn()
export const saveBackgroundPreference = (selectedBackground: string | null) =>
  saveBackgroundFn({ data: { selectedBackground } })
