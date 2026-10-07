import { createServerFn } from "@tanstack/react-start"
import { eq } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/server/db"
import { userGet, userPost } from "@/server/guards"
import { loadPomodoroEntitlements } from "@/server/pomodoro/entitlements"
import { loadOrCreatePreferences } from "@/server/pomodoro/productivity"
import { userPreferences } from "@/server/pomodoro/schema"
import { CHIME_IDS, normalizeChime } from "@/lib/pomodoro/chimes"

/**
 * The sound player's own saved settings: volume, mute, the completion alerts
 * and the two chimes. Which loop plays is not one of them; that belongs to
 * the room you are in (`src/lib/api/pomodoro/personal-room.ts`).
 */

const soundPreferenceSchema = z.object({
  soundVolume: z.number().int().min(0).max(100),
  soundMuted: z.boolean(),
  completionAlerts: z.boolean(),
  focusChime: z.enum(CHIME_IDS),
  breakChime: z.enum(CHIME_IDS),
})

const loadSoundPreferencesFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }) => {
    const [preferences, entitlements] = await Promise.all([
      loadOrCreatePreferences(context.user.id),
      loadPomodoroEntitlements(context.user.id),
    ])
    return {
      soundVolume: preferences.soundVolume,
      soundMuted: preferences.soundMuted,
      completionAlerts: preferences.completionAlerts,
      focusChime: normalizeChime(preferences.focusChime),
      breakChime: normalizeChime(preferences.breakChime),
      canUsePremiumMedia: entitlements.canUsePremiumMedia,
    }
  })

const saveSoundPreferencesFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(soundPreferenceSchema)
  .handler(async ({ data, context }) => {
    await loadOrCreatePreferences(context.user.id)
    const [updated] = await db
      .update(userPreferences)
      .set({
        soundVolume: data.soundVolume,
        soundMuted: data.soundMuted,
        completionAlerts: data.completionAlerts,
        focusChime: data.focusChime,
        breakChime: data.breakChime,
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
