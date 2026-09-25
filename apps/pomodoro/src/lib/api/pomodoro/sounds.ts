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
  curatedSounds,
  parseSoundReference,
} from "@/lib/pomodoro/sound-catalog"

/**
 * The sound player's saved state. Saving a premium loop is refused for a
 * free account (UPGRADE_REQUIRED:premiumMedia), so the lock cannot be
 * clicked around by calling the endpoint directly.
 */

const soundPreferenceSchema = z.object({
  selectedSound: z.string().max(60).nullable(),
  soundVolume: z.number().int().min(0).max(100),
  soundMuted: z.boolean(),
  completionAlerts: z.boolean(),
})

const loadSoundPreferencesFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }) => {
    const [preferences, entitlements] = await Promise.all([
      loadOrCreatePreferences(context.user.id),
      loadPomodoroEntitlements(context.user.id),
    ])
    // The same as the background loader: an upload's address comes from the
    // server, and a selection that is gone comes back without one.
    const reference = parseSoundReference(preferences.selectedSound)
    const upload =
      reference?.type === "media"
        ? await resolveUploadUrl(context.user.id, reference.mediaId)
        : null

    return {
      selectedSound: preferences.selectedSound,
      soundVolume: preferences.soundVolume,
      soundMuted: preferences.soundMuted,
      completionAlerts: preferences.completionAlerts,
      canUsePremiumMedia: entitlements.canUsePremiumMedia,
      selectedUploadUrl: upload?.url ?? null,
    }
  })

const saveSoundPreferencesFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(soundPreferenceSchema)
  .handler(async ({ data, context }) => {
    const reference =
      data.selectedSound === null
        ? null
        : parseSoundReference(data.selectedSound)
    if (data.selectedSound !== null && !reference)
      throw new Error("UNKNOWN_SOUND")
    if (reference?.type === "curated") {
      const sound = curatedSounds.find((entry) => entry.key === reference.key)
      if (sound?.locked) {
        const entitlements = await loadPomodoroEntitlements(context.user.id)
        if (!entitlements.canUsePremiumMedia)
          throw new Error("UPGRADE_REQUIRED:premiumMedia")
      }
    }
    // An upload has to be this person's own and finished being prepared, the
    // same check the background preference makes.
    if (reference?.type === "media") {
      await assertUploadUsable(context.user.id, reference.mediaId, "sound")
    }
    await loadOrCreatePreferences(context.user.id)
    const [updated] = await db
      .update(userPreferences)
      .set({
        selectedSound: data.selectedSound,
        soundVolume: data.soundVolume,
        soundMuted: data.soundMuted,
        completionAlerts: data.completionAlerts,
        updatedAt: new Date(),
      })
      .where(eq(userPreferences.userId, context.user.id))
      .returning()
    return updated
  })

export const loadSoundPreferences = () => loadSoundPreferencesFn()
export const saveSoundPreferences = (
  data: z.infer<typeof soundPreferenceSchema>
) => saveSoundPreferencesFn({ data })
