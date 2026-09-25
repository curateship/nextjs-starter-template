import { createServerFn } from "@tanstack/react-start"
import { eq } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/server/db"
import { userGet, userPost } from "@/server/guards"
import { loadPomodoroEntitlements } from "@/server/pomodoro/entitlements"
import { loadOrCreatePreferences } from "@/server/pomodoro/productivity"
import { userPreferences } from "@/server/pomodoro/schema"
import {
  curatedBackgrounds,
  parseBackgroundReference,
} from "@/lib/pomodoro/background-catalog"

/**
 * The chosen background scene. Saving a Pro scene on a free account is
 * refused (UPGRADE_REQUIRED:premiumMedia); uploaded-media backgrounds join
 * with the own-media task.
 */

const loadBackgroundFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }) => {
    const [preferences, entitlements] = await Promise.all([
      loadOrCreatePreferences(context.user.id),
      loadPomodoroEntitlements(context.user.id),
    ])
    return {
      selectedBackground: preferences.selectedBackground,
      canUsePremiumMedia: entitlements.canUsePremiumMedia,
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
