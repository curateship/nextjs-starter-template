import { createServerFn } from "@tanstack/react-start"
import { eq } from "drizzle-orm"
import { z } from "zod"

import { STREAK_REMINDER_HOURS } from "@/lib/pomodoro/streak-reminder"
import { db } from "@/server/db"
import { userGet, userPost } from "@/server/guards"
import { loadOrCreatePreferences } from "@/server/pomodoro/productivity"
import { userPreferences } from "@/server/pomodoro/schema"

/**
 * The evening streak reminder's settings: on or off, and the local hour it
 * may go from. Off until the member switches it on. Bell only, no email.
 * See `workspace/docs/streak-reminder.md`.
 */
const loadStreakReminderFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }) => {
    const preferences = await loadOrCreatePreferences(context.user.id)
    return {
      bell: preferences.streakReminderBell,
      hour: preferences.streakReminderHour,
    }
  })

const saveStreakReminderFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      bell: z.boolean(),
      hour: z
        .number()
        .int()
        .refine((hour) =>
          (STREAK_REMINDER_HOURS as readonly number[]).includes(hour)
        ),
    })
  )
  .handler(async ({ data, context }) => {
    await loadOrCreatePreferences(context.user.id)
    await db
      .update(userPreferences)
      .set({
        streakReminderBell: data.bell,
        streakReminderHour: data.hour,
        updatedAt: new Date(),
      })
      .where(eq(userPreferences.userId, context.user.id))
    return data
  })

export const loadStreakReminder = () => loadStreakReminderFn()
export const saveStreakReminder = (data: {
  bell: boolean
  hour: number
}) => saveStreakReminderFn({ data })
