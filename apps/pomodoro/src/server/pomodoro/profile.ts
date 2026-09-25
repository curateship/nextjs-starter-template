import { eq } from "drizzle-orm"

import { db } from "@/server/db"
import { pomodoroProfiles } from "@/server/pomodoro/schema"
import { localDateFor } from "@/server/pomodoro/productivity"

/**
 * The app's own per-person profile: public display name, timezone and the
 * leaderboard opt-in. The timezone is what anchors "today" for goals and
 * streaks — a saved one wins, and until one is saved the browser's own is
 * used and quietly recorded, so the day boundary never silently changes
 * when someone travels.
 */

export function validTimezone(value: string) {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: value })
    return true
  } catch {
    return false
  }
}

export async function loadOrCreateProfile(
  userId: string,
  fallbackTimezone: string
) {
  const [existing] = await db
    .select()
    .from(pomodoroProfiles)
    .where(eq(pomodoroProfiles.userId, userId))
    .limit(1)
  if (existing) return existing
  const timezone = validTimezone(fallbackTimezone) ? fallbackTimezone : "UTC"
  const [created] = await db
    .insert(pomodoroProfiles)
    .values({ userId, timezone })
    .onConflictDoUpdate({
      target: pomodoroProfiles.userId,
      set: { updatedAt: new Date() },
    })
    .returning()
  return created
}

/** The user's calendar day, from the saved timezone (browser's on first use). */
export async function userToday(userId: string, browserTimezone: string) {
  const profile = await loadOrCreateProfile(userId, browserTimezone)
  return localDateFor(profile.timezone)
}

export async function updateProfile(
  userId: string,
  changes: {
    publicDisplayName: string | null
    timezone: string
    leaderboardOptIn: boolean
  }
) {
  if (!validTimezone(changes.timezone)) throw new Error("INVALID_TIMEZONE")
  const [updated] = await db
    .insert(pomodoroProfiles)
    .values({ userId, ...changes })
    .onConflictDoUpdate({
      target: pomodoroProfiles.userId,
      set: { ...changes, updatedAt: new Date() },
    })
    .returning()
  return updated
}
