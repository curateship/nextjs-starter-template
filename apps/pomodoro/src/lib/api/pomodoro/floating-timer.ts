import { createServerFn } from "@tanstack/react-start"
import { eq } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/server/db"
import { userGet, userPost } from "@/server/guards"
import { loadOrCreatePreferences } from "@/server/pomodoro/productivity"
import { userPreferences } from "@/server/pomodoro/schema"

/**
 * The member's own switch for the floating timer opening by itself, in
 * Settings → Timer. See `workspace/docs/floating-timer.md`.
 */

const loadFloatingTimerFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }) => ({
    enabled: (await loadOrCreatePreferences(context.user.id)).floatingTimer,
  }))

const saveFloatingTimerFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ enabled: z.boolean() }))
  .handler(async ({ data, context }) => {
    await loadOrCreatePreferences(context.user.id)
    await db
      .update(userPreferences)
      .set({ floatingTimer: data.enabled, updatedAt: new Date() })
      .where(eq(userPreferences.userId, context.user.id))
    return { enabled: data.enabled }
  })

export const loadFloatingTimerSetting = () => loadFloatingTimerFn()
export const saveFloatingTimerSetting = (enabled: boolean) =>
  saveFloatingTimerFn({ data: { enabled } })
