import { randomBytes } from "node:crypto"
import { eq } from "drizzle-orm"

import { STREAK_BADGE_MAX_AGE_SECONDS } from "@/lib/pomodoro/streak-badge"
import { db } from "@/server/db"
import { localDateFor, loadFocusStreaks } from "@/server/pomodoro/productivity"
import { pomodoroProfiles } from "@/server/pomodoro/schema"

/**
 * The public streak badge's server half: the secret in its address, and the
 * two facts it is allowed to publish.
 *
 * The badge is off until someone switches it on, and switching it off clears
 * the secret, which is what makes the old address stop working. There is no
 * "disabled but still resolvable" state to get wrong.
 */

/**
 * 32 bytes of randomness, written as 43 url-safe characters. Far past
 * guessing: the address is the only thing protecting the badge, so it has to
 * be worth more than a password.
 */
function newToken() {
  return randomBytes(32).toString("base64url")
}

export async function enableStreakBadge(userId: string) {
  const token = newToken()
  const [updated] = await db
    .update(pomodoroProfiles)
    .set({ streakBadgeToken: token, updatedAt: new Date() })
    .where(eq(pomodoroProfiles.userId, userId))
    .returning({ streakBadgeToken: pomodoroProfiles.streakBadgeToken })
  if (!updated) throw new Error("PROFILE_NOT_FOUND")
  // A new secret orphans the old one, so anything cached under it is now
  // answering for an address nobody can reach.
  forgetCachedBadges(userId)
  return updated.streakBadgeToken
}

export async function disableStreakBadge(userId: string) {
  await db
    .update(pomodoroProfiles)
    .set({ streakBadgeToken: null, updatedAt: new Date() })
    .where(eq(pomodoroProfiles.userId, userId))
  forgetCachedBadges(userId)
}

/**
 * What the badge at this address says right now, or null if no badge lives
 * there.
 *
 * Null covers both an address that was never real and one that has been
 * revoked, and the route answers 404 either way, so nobody can tell a
 * cancelled badge from a made-up one.
 *
 * The streak is computed in the account's own timezone, the same boundary the
 * app uses everywhere else, so the number on a blog matches the number on the
 * dashboard.
 */
export async function readStreakBadge(token: string) {
  const [profile] = await db
    .select({
      userId: pomodoroProfiles.userId,
      displayName: pomodoroProfiles.publicDisplayName,
      timezone: pomodoroProfiles.timezone,
    })
    .from(pomodoroProfiles)
    .where(eq(pomodoroProfiles.streakBadgeToken, token))
    .limit(1)
  if (!profile) return null
  const { currentStreak } = await loadFocusStreaks(
    profile.userId,
    localDateFor(profile.timezone)
  )
  return {
    userId: profile.userId,
    displayName: profile.displayName,
    currentStreak,
  }
}

/**
 * A few minutes of memory in front of the database.
 *
 * An embed sits on someone else's page and is fetched once per reader, so a
 * popular blog would otherwise turn every page view into a streak query. The
 * window matches the Cache-Control the route sends, so the answer a reader
 * gets is never older than the one they were told they could keep.
 *
 * Deliberately a plain Map in one process: it holds two numbers and a name
 * per badge, it is allowed to be wrong for five minutes by design, and it
 * costs nothing when the process restarts.
 */
type CacheEntry = {
  userId: string
  body: string
  expiresAt: number
}

const cache = new Map<string, CacheEntry>()
const CACHE_MS = STREAK_BADGE_MAX_AGE_SECONDS * 1_000
/**
 * A ceiling on how many badges are held at once, so a process serving a great
 * many of them cannot grow the map without bound. Only badges that exist are
 * ever stored, because the route writes here after a successful lookup and a
 * missing badge returns before that, so an invented address costs nothing.
 */
const CACHE_LIMIT = 500

export function readCachedBadge(token: string, now = Date.now()) {
  const entry = cache.get(token)
  if (!entry) return null
  if (entry.expiresAt <= now) {
    cache.delete(token)
    return null
  }
  return entry.body
}

export function writeCachedBadge(
  token: string,
  userId: string,
  body: string,
  now = Date.now()
) {
  if (cache.size >= CACHE_LIMIT) {
    // Oldest insertion first, which is what a Map iterates.
    const oldest = cache.keys().next()
    if (!oldest.done) cache.delete(oldest.value)
  }
  cache.set(token, { userId, body, expiresAt: now + CACHE_MS })
}

/**
 * Drops every cached badge belonging to an account. Called when a badge is
 * switched off or its address is replaced, so revoking takes effect at the
 * origin on the very next request rather than after the cache expires.
 */
export function forgetCachedBadges(userId: string) {
  for (const [token, entry] of cache)
    if (entry.userId === userId) cache.delete(token)
}
