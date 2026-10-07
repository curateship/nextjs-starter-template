import { eq } from "drizzle-orm"

import { db, type CustomShellDb } from "@/server/db"
import { loadPomodoroEntitlements } from "@/server/pomodoro/entitlements"
import { pomodoroProfiles } from "@/server/pomodoro/schema"
import { localDateFor } from "@/server/pomodoro/productivity"

/**
 * The app's own per-person profile: public display name, timezone, the
 * leaderboard opt-in and whether rooms see the task you are focusing on.
 * The timezone is what anchors "today" for goals and streaks — a saved one
 * wins, and until one is saved the browser's own is used and quietly
 * recorded, so the day boundary never silently changes when someone travels.
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
    shareTaskInRooms: boolean
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

/**
 * The two facts the header's account menu needs that the shell's user record
 * does not carry: whether the person is on a paid plan, and the address of
 * their public page.
 *
 * `profileHandle` is set only when `/u/<handle>` would actually open. A handle
 * on a page that is switched off, or that an operator hid, answers the same
 * 404 a stranger gets, and a menu row leading there would read as broken.
 */
export async function loadAccountMenu(
  userId: string,
  database: CustomShellDb = db
) {
  const [[profile], entitlements] = await Promise.all([
    database
      .select({
        handle: pomodoroProfiles.handle,
        profilePublic: pomodoroProfiles.profilePublic,
        hiddenAt: pomodoroProfiles.hiddenAt,
      })
      .from(pomodoroProfiles)
      .where(eq(pomodoroProfiles.userId, userId))
      .limit(1),
    loadPomodoroEntitlements(userId, database),
  ])
  const pageOpens = Boolean(
    profile?.handle && profile.profilePublic && !profile.hiddenAt
  )
  return {
    isPaid: entitlements.isPaid,
    profileHandle: pageOpens ? (profile?.handle ?? null) : null,
  }
}
