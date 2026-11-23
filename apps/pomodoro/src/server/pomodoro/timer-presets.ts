import { and, asc, eq } from "drizzle-orm"

import { TIMER_PRESET_LIMIT } from "@/lib/pomodoro/timer-presets"
import { db } from "@/server/db"
import { userTimerPresets } from "@/server/pomodoro/schema"
import { customShellUsers } from "@/server/schema"

/**
 * Custom focus rhythms, ported from the old app: at most 10 per person,
 * names unique per person regardless of case.
 */

export type TimerPresetInput = {
  name: string
  focusMinutes: number
  shortBreakMinutes: number
  longBreakMinutes: number
  sessionsBeforeLongBreak: number
  autoStart: boolean
}

export async function listTimerPresets(userId: string) {
  return db
    .select()
    .from(userTimerPresets)
    .where(eq(userTimerPresets.userId, userId))
    .orderBy(asc(userTimerPresets.createdAt), asc(userTimerPresets.id))
}

function nameTaken(
  rows: readonly { id: string; name: string }[],
  name: string,
  exceptId?: string
) {
  const lowered = name.toLowerCase()
  return rows.some(
    (row) => row.id !== exceptId && row.name.toLowerCase() === lowered
  )
}

type PresetTx = Parameters<Parameters<typeof db.transaction>[0]>[0]

// Locking the owner row serialises each user's preset mutations, so two
// concurrent creates can never both pass the count or name checks.
async function lockPresetRows(tx: PresetTx, userId: string) {
  await tx
    .select({ id: customShellUsers.id })
    .from(customShellUsers)
    .where(eq(customShellUsers.id, userId))
    .for("update")
  return tx
    .select({ id: userTimerPresets.id, name: userTimerPresets.name })
    .from(userTimerPresets)
    .where(eq(userTimerPresets.userId, userId))
}

export async function createTimerPreset(
  userId: string,
  input: TimerPresetInput
) {
  return db.transaction(async (tx) => {
    const existing = await lockPresetRows(tx, userId)
    if (existing.length >= TIMER_PRESET_LIMIT)
      throw new Error("PRESET_LIMIT_REACHED")
    if (nameTaken(existing, input.name)) throw new Error("PRESET_NAME_TAKEN")
    const [created] = await tx
      .insert(userTimerPresets)
      .values({ userId, ...input })
      .returning()
    return created
  })
}

export async function updateTimerPreset(
  userId: string,
  presetId: string,
  input: TimerPresetInput
) {
  return db.transaction(async (tx) => {
    const existing = await lockPresetRows(tx, userId)
    if (!existing.some((row) => row.id === presetId))
      throw new Error("PRESET_NOT_FOUND")
    if (nameTaken(existing, input.name, presetId))
      throw new Error("PRESET_NAME_TAKEN")
    const [updated] = await tx
      .update(userTimerPresets)
      .set({ ...input, updatedAt: new Date() })
      .where(
        and(
          eq(userTimerPresets.id, presetId),
          eq(userTimerPresets.userId, userId)
        )
      )
      .returning()
    return updated
  })
}

/**
 * Removes only the stored preset; the user's preferences and any timer in
 * progress are never touched.
 */
export async function deleteTimerPreset(userId: string, presetId: string) {
  const deleted = await db
    .delete(userTimerPresets)
    .where(
      and(
        eq(userTimerPresets.id, presetId),
        eq(userTimerPresets.userId, userId)
      )
    )
    .returning({ id: userTimerPresets.id })
  if (!deleted.length) throw new Error("PRESET_NOT_FOUND")
  return { ok: true }
}
