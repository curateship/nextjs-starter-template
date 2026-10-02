import { and, eq, gte, isNull, sql } from "drizzle-orm"
import sharp from "sharp"

import {
  renderShareCardSvg,
  SHARE_CARD_MAX_AGE_SECONDS,
} from "@/lib/pomodoro/share-card"
import { isHandleAvailableShape } from "@/lib/pomodoro/public-profile"
import { db } from "@/server/db"
import { isBlockedBetween } from "@/server/pomodoro/blocks"
import {
  dailyFocusStats,
  pomodoroProfiles,
} from "@/server/pomodoro/schema"
import { localDateFor, loadFocusStreaks } from "@/server/pomodoro/productivity"

/**
 * The share card's server half: the two figures on it, and the PNG.
 *
 * Rendered as SVG and rasterised with sharp, which is already a dependency
 * and already used for the brand images. The rasteriser has no network and no
 * web fonts, which is why the card names only generic font families.
 *
 * Held in memory for the same five minutes the response says it may be
 * cached, so a link pasted into a busy channel is one read rather than one
 * per reader. The shape is the streak badge's, down to the capped map.
 */

const CACHE_MS = SHARE_CARD_MAX_AGE_SECONDS * 1_000
const CACHE_LIMIT = 200

type Held = { png: Buffer; expiresAt: number }
const cache = new Map<string, Held>()

export function readCachedShareCard(handle: string, now = Date.now()) {
  const held = cache.get(handle)
  if (!held) return null
  if (held.expiresAt <= now) {
    cache.delete(handle)
    return null
  }
  return held.png
}

function writeCachedShareCard(handle: string, png: Buffer, now = Date.now()) {
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next()
    if (!oldest.done) cache.delete(oldest.value)
  }
  cache.set(handle, { png, expiresAt: now + CACHE_MS })
}

/** Drops a held card, so a renamed or switched-off profile stops serving one. */
export function forgetShareCard(handle: string | null) {
  if (handle) cache.delete(handle)
}

/**
 * The card for a handle, or null when there is no card to draw.
 *
 * Null covers an unknown handle, a switched-off profile and a hidden one
 * alike, and the route answers 404 for all three, so a preview bot showing
 * nothing is the only thing anybody learns.
 */
export async function renderShareCard(
  handle: string,
  viewerUserId: string | null = null,
  now = Date.now()
): Promise<Buffer | null> {
  if (!isHandleAvailableShape(handle)) return null

  // A blocked reader gets the same 404 the profile itself gives them. Checked
  // before the held picture, which is the same one for every reader. A
  // preview bot carries no session, so this costs nothing on the path this
  // route exists for.
  if (viewerUserId) {
    const [owner] = await db
      .select({ userId: pomodoroProfiles.userId })
      .from(pomodoroProfiles)
      .where(eq(pomodoroProfiles.handle, handle))
      .limit(1)
    if (owner && (await isBlockedBetween(viewerUserId, owner.userId)))
      return null
  }

  const held = readCachedShareCard(handle, now)
  if (held) return held

  const [profile] = await db
    .select({
      userId: pomodoroProfiles.userId,
      displayName: pomodoroProfiles.publicDisplayName,
      timezone: pomodoroProfiles.timezone,
      showFigures: pomodoroProfiles.showFigures,
    })
    .from(pomodoroProfiles)
    .where(
      and(
        eq(pomodoroProfiles.handle, handle),
        eq(pomodoroProfiles.profilePublic, true),
        isNull(pomodoroProfiles.hiddenAt)
      )
    )
    .limit(1)
  if (!profile) return null

  const today = localDateFor(profile.timezone, new Date(now))
  const monthStart = `${today.slice(0, 7)}-01`

  // The card only ever shows figures the profile itself publishes. With the
  // figures switched off it draws zeros rather than leaking them.
  const [[monthRow], streaks] = await Promise.all([
    profile.showFigures
      ? db
          .select({
            seconds: sql<number>`coalesce(sum(${dailyFocusStats.focusSeconds}), 0)::bigint`,
          })
          .from(dailyFocusStats)
          .where(
            and(
              eq(dailyFocusStats.userId, profile.userId),
              gte(dailyFocusStats.localDate, monthStart)
            )
          )
      : [{ seconds: 0 }],
    profile.showFigures
      ? loadFocusStreaks(profile.userId, today)
      : { currentStreak: 0, bestStreak: 0 },
  ])

  const svg = renderShareCardSvg({
    name: profile.displayName?.trim() || handle,
    handle,
    hoursThisMonth: Math.floor(Number(monthRow?.seconds ?? 0) / 3_600),
    currentStreak: streaks.currentStreak,
  })
  const png = await sharp(Buffer.from(svg)).png().toBuffer()
  writeCachedShareCard(handle, png, now)
  return png
}
