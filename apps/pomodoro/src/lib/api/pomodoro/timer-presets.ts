import { createServerFn } from "@tanstack/react-start"
import { and, eq, gt, sql } from "drizzle-orm"
import { z } from "zod"

import {
  SESSIONS_BEFORE_LONG_BREAK_MAX,
  SESSIONS_BEFORE_LONG_BREAK_MIN,
} from "@/lib/pomodoro/timer-presets"
import { db } from "@/server/db"
import { userGet, userPost } from "@/server/guards"
import { focusSessions, userPreferences } from "@/server/pomodoro/schema"
import {
  createTimerPreset as createPresetRow,
  deleteTimerPreset as deletePresetRow,
  listTimerPresets as listPresetRows,
  updateTimerPreset as updatePresetRow,
} from "@/server/pomodoro/timer-presets"

/**
 * Custom rhythm endpoints, plus applying a preset. Applying writes the four
 * values into the saved preferences, and is refused while a focus session is
 * genuinely mid-countdown (a running row whose end moment is still ahead) —
 * a rhythm change never silently rewires a timer somebody is watching.
 */

const presetValuesSchema = z.object({
  name: z.string().trim().min(1).max(60),
  focusMinutes: z.number().int().min(1).max(90),
  shortBreakMinutes: z.number().int().min(1).max(90),
  longBreakMinutes: z.number().int().min(1).max(90),
  sessionsBeforeLongBreak: z
    .number()
    .int()
    .min(SESSIONS_BEFORE_LONG_BREAK_MIN)
    .max(SESSIONS_BEFORE_LONG_BREAK_MAX),
  autoStart: z.boolean(),
})

const listPresetsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }) => listPresetRows(context.user.id))

const createPresetFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(presetValuesSchema)
  .handler(async ({ data, context }) => createPresetRow(context.user.id, data))

const updatePresetFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(presetValuesSchema.extend({ presetId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { presetId, ...input } = data
    return updatePresetRow(context.user.id, presetId, input)
  })

const deletePresetFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ presetId: z.string().uuid() }))
  .handler(async ({ data, context }) =>
    deletePresetRow(context.user.id, data.presetId)
  )

const applyPresetFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    presetValuesSchema.omit({ name: true }).extend({
      dailyGoalSessions: z.number().int().min(1).max(20),
    })
  )
  .handler(async ({ data, context }) => {
    const [live] = await db
      .select({ id: focusSessions.id })
      .from(focusSessions)
      .where(
        and(
          eq(focusSessions.userId, context.user.id),
          eq(focusSessions.status, "running"),
          gt(focusSessions.targetEndsAt, sql`now()`)
        )
      )
      .limit(1)
    if (live) throw new Error("TIMER_RUNNING")
    const [preferences] = await db
      .insert(userPreferences)
      .values({ userId: context.user.id, ...data })
      .onConflictDoUpdate({
        target: userPreferences.userId,
        set: { ...data, updatedAt: new Date() },
      })
      .returning()
    return preferences
  })

export const listTimerPresets = () => listPresetsFn()
export const createTimerPreset = (
  data: z.infer<typeof presetValuesSchema>
) => createPresetFn({ data })
export const updateTimerPreset = (
  data: z.infer<typeof presetValuesSchema> & { presetId: string }
) => updatePresetFn({ data })
export const deleteTimerPreset = (presetId: string) =>
  deletePresetFn({ data: { presetId } })
export const applyTimerPreset = (data: {
  focusMinutes: number
  shortBreakMinutes: number
  longBreakMinutes: number
  sessionsBeforeLongBreak: number
  autoStart: boolean
  dailyGoalSessions: number
}) => applyPresetFn({ data })
