import { eq, inArray } from "drizzle-orm"

import {
  NEW_PROFILE_DEFAULTS,
  firstNameOf,
  handleCandidatesFor,
} from "@/lib/pomodoro/public-profile"
import { db, type CustomShellDb } from "@/server/db"
import { loadPomodoroEntitlements } from "@/server/pomodoro/entitlements"
import { pomodoroProfiles } from "@/server/pomodoro/schema"
import { customShellUsers } from "@/server/schema"
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

/**
 * The person's profile row, made on first use. A new row starts public, on
 * the leaderboard, with every section showing (`NEW_PROFILE_DEFAULTS`), and
 * with the first name as both the handle and the display name. The
 * leaderboard leaves out anyone with no display name, so the switch alone
 * would not put a new member on it.
 */
export async function loadOrCreateProfile(
  userId: string,
  fallbackTimezone: string,
  database: CustomShellDb = db
) {
  const [existing] = await database
    .select()
    .from(pomodoroProfiles)
    .where(eq(pomodoroProfiles.userId, userId))
    .limit(1)
  if (existing) return existing
  const timezone = validTimezone(fallbackTimezone) ? fallbackTimezone : "UTC"
  const [user] = await database
    .select({ name: customShellUsers.name })
    .from(customShellUsers)
    .where(eq(customShellUsers.id, userId))
    .limit(1)
  const name = user?.name ?? ""
  const publicDisplayName = firstNameOf(name).slice(0, 50) || null

  const create = (handle: string | null) =>
    database
      .insert(pomodoroProfiles)
      .values({
        userId,
        timezone,
        ...NEW_PROFILE_DEFAULTS,
        publicDisplayName,
        handle,
      })
      .onConflictDoUpdate({
        target: pomodoroProfiles.userId,
        set: { updatedAt: new Date() },
      })
      .returning()

  // Two people named Sam signing up at once can both see `sam2` free. The
  // second insert then hits the unique index, and the next pass looks again.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const handle = await firstFreeHandle(handleCandidatesFor(name), database)
    try {
      const [created] = await create(handle)
      return created
    } catch (error) {
      if (!isDuplicateHandle(error)) throw error
    }
  }
  // Never stop someone using the timer over a handle. They can pick one on
  // Settings → Public page, and with none the page simply does not open.
  const [created] = await create(null)
  return created
}

/**
 * The handle's unique index refusing the insert. The same walk as
 * `isDuplicateHandle` in `public-profile.ts`, kept here because that file
 * imports this one. The other unique column, the badge token, is null on a
 * new row, so a clash here can only be the handle.
 */
function isDuplicateHandle(error: unknown) {
  for (let step: unknown = error, depth = 0; step && depth < 5; depth += 1) {
    if (typeof step !== "object") return false
    if ((step as { code?: string }).code === "23505") return true
    step = (step as { cause?: unknown }).cause
  }
  return false
}

async function firstFreeHandle(candidates: string[], database: CustomShellDb) {
  if (candidates.length === 0) return null
  const taken = await database
    .select({ handle: pomodoroProfiles.handle })
    .from(pomodoroProfiles)
    .where(inArray(pomodoroProfiles.handle, candidates))
  const takenSet = new Set(taken.map((row) => row.handle))
  return candidates.find((candidate) => !takenSet.has(candidate)) ?? null
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
