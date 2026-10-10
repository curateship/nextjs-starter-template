import { and, count, desc, eq, gt, gte, inArray, isNull, lte, sql } from "drizzle-orm"

import {
  parseBackgroundReference,
  serializeBackgroundReference,
} from "@/lib/pomodoro/background-catalog"
import { findTheme } from "@/lib/pomodoro/catalog"
import { findAchievement } from "@/lib/pomodoro/achievements"
import {
  USER_SEARCH_MAX_LENGTH,
  type UserSort,
} from "@/lib/pomodoro/user-directory"
import { shiftLocalDate } from "@/lib/pomodoro/focus-history"
import {
  isHandleAvailableShape,
  MAX_PINNED_BADGES,
  type PublicProfileBadge,
  type PublicProfileFigures,
  type PublicProfileView,
  type YearInReviewView,
} from "@/lib/pomodoro/public-profile"
import {
  normalizePublicSocialLinks,
  type PublicSocialLink,
} from "@/lib/pages/public-social"

import { db } from "@/server/db"
import { loadOrCreateProfile } from "@/server/pomodoro/profile"
import { getPublicMediaUrl } from "@/server/media/storage"
import { loadMediaCatalog } from "@/server/pomodoro/catalog"
import { requirePomodoroPerk } from "@/server/pomodoro/entitlements"
import { completedFocusWithin, localDateStartInstant } from "@/server/pomodoro/focus-report"
import {
  calculateFocusStreaks,
  loadFocusStreaks,
  localDateFor,
} from "@/server/pomodoro/productivity"
import { blockedUserIdsFor, isBlockedBetween } from "@/server/pomodoro/blocks"
import { listSharedMedia } from "@/server/pomodoro/shared-media"
import { PROFILE_SHARED_COUNT } from "@/lib/pomodoro/shared-media"
import {
  dailyFocusStats,
  focusSessions,
  pomodoroFollows,
  pomodoroAchievements,
  pomodoroMediaUploads,
  pomodoroProfiles,
  pomodoroProjects,
  rooms,
  tasks,
} from "@/server/pomodoro/schema"
import { customShellMedia, customShellUsers } from "@/server/schema"

/**
 * The public profile's server half: what `/u/<handle>` is allowed to say, and
 * the memory that keeps a visitor from becoming a database query.
 *
 * Three rules shape every line in this file.
 *
 * **The server decides what to send.** A section whose switch is off is never
 * read, so it is not in the page's data and there is nothing in a network tab
 * for a reader to find. The page draws what arrives and asks for nothing.
 *
 * **No user id ever leaves this file.** A handle is the public name of an
 * account, and the id it resolves to stays here. Nothing returned below
 * carries one.
 *
 * **No visitor causes a read.** The assembled page is held for a short window
 * and every visitor inside it is served the held copy, the same trade the
 * public front-page figures make (`workspace/docs/public-live-figures.md`).
 */

/**
 * How long an assembled profile is held.
 *
 * Thirty seconds rather than the badge's five minutes, because "Focusing now"
 * has to be gone within a minute of a session ending and the held copy is the
 * only thing in the way. Everything else on the page would happily be an hour
 * old.
 */
const PROFILE_CACHE_MS = 30_000

/**
 * A year that has ended never changes again, so its recap is held for a day.
 * The running year is held for the same thirty seconds as the profile, since
 * today's focus still lands in it.
 */
const FINISHED_YEAR_CACHE_MS = 24 * 60 * 60_000

/** A ceiling on held pages, so a crawler cannot grow the map without bound. */
const CACHE_LIMIT = 500

/** The first year the app has figures for, the leaderboard's own floor. */
export const FIRST_RECAP_YEAR = 2025

/**
 * Under this, a year recap says the year is not finished rather than printing
 * a page of near-zeros. Tyler's call, 2 Oct 2026, the same thinking as hiding
 * a quiet front-page row instead of rounding it up.
 */
export const RECAP_MIN_FOCUS_HOURS = 20

type Held<T> = { value: T; expiresAt: number }

/**
 * The held page, plus whose it is.
 *
 * The owner's id is kept here and never returned. A block is between two
 * accounts, so the check needs the owner's id — and holding it beside the
 * page means a signed-in visitor costs no extra query to find out. It stays
 * in this process; nothing puts it in an answer.
 */
type HeldProfile = {
  view: PublicProfileView | null
  ownerUserId: string | null
  /**
   * "My shared sounds and backgrounds" is on. The files themselves are read
   * per visit rather than held, because a file unshared a second ago must
   * be gone on the next load, and the heart is the reader's own.
   */
  showSharedMedia: boolean
}

const profileCache = new Map<string, Held<HeldProfile>>()
const recapCache = new Map<string, Held<YearInReviewView | null>>()

function readHeld<T>(cache: Map<string, Held<T>>, key: string, now: number) {
  const held = cache.get(key)
  if (!held) return undefined
  if (held.expiresAt <= now) {
    cache.delete(key)
    return undefined
  }
  return held.value
}

function writeHeld<T>(
  cache: Map<string, Held<T>>,
  key: string,
  value: T,
  ttl: number,
  now: number
) {
  if (cache.size >= CACHE_LIMIT) {
    // Oldest insertion first, which is what a Map iterates.
    const oldest = cache.keys().next()
    if (!oldest.done) cache.delete(oldest.value)
  }
  cache.set(key, { value, expiresAt: now + ttl })
}

/**
 * Drops every held page for one handle. Called the moment its owner saves,
 * so switching a section off, or the whole page off, takes effect on the very
 * next request instead of after the window runs out.
 */
export function forgetPublicProfile(handle: string | null) {
  if (!handle) return
  profileCache.delete(handle)
  for (const key of recapCache.keys())
    if (key.startsWith(`${handle}:`)) recapCache.delete(key)
}

/**
 * The account behind a handle, or null.
 *
 * Null covers an unknown handle, a switched-off profile and a deleted account
 * alike, because the row is gone with the account and the switch is part of
 * the condition. The caller answers 404 for all three, so nobody can learn
 * from the response whether a profile ever existed.
 */
async function readProfileRow(handle: string) {
  const [row] = await db
    .select({
      userId: pomodoroProfiles.userId,
      displayName: pomodoroProfiles.publicDisplayName,
      timezone: pomodoroProfiles.timezone,
      bio: pomodoroProfiles.bio,
      socialLinks: pomodoroProfiles.socialLinks,
      bannerRef: pomodoroProfiles.bannerRef,
      pinnedBadges: pomodoroProfiles.pinnedBadges,
      showFigures: pomodoroProfiles.showFigures,
      showBadges: pomodoroProfiles.showBadges,
      showHeatmap: pomodoroProfiles.showHeatmap,
      showProjects: pomodoroProfiles.showProjects,
      showFocusingNow: pomodoroProfiles.showFocusingNow,
      showRoom: pomodoroProfiles.showRoom,
      showSharedMedia: pomodoroProfiles.showSharedMedia,
      avatarUrl: customShellUsers.avatarUrl,
    })
    .from(pomodoroProfiles)
    .innerJoin(
      customShellUsers,
      eq(customShellUsers.id, pomodoroProfiles.userId)
    )
    .where(
      and(
        eq(pomodoroProfiles.handle, handle),
        eq(pomodoroProfiles.profilePublic, true),
        // An operator's hide answers exactly as a switched-off profile does.
        // One condition, so there is no second kind of 404 to get wrong.
        isNull(pomodoroProfiles.hiddenAt)
      )
    )
    .limit(1)
  return row ?? null
}

/**
 * The banner's address, or null.
 *
 * A scene resolves to its still from the catalogue. An upload
 * resolves only when it belongs to this account and has finished processing,
 * so a banner pointing at a deleted upload falls back to no banner rather
 * than a broken picture.
 */
async function resolveBannerUrl(userId: string, bannerRef: string | null) {
  const reference = parseBackgroundReference(bannerRef)
  if (!reference) return null
  if (reference.type === "scene") {
    // A scene that went Draft or was deleted leaves no banner rather than a
    // broken picture, the same as a deleted upload.
    return findTheme(await loadMediaCatalog(), reference.key)?.stillUrl ?? null
  }

  const [row] = await db
    .select({
      storagePath: customShellMedia.storagePath,
      status: pomodoroMediaUploads.status,
      kind: pomodoroMediaUploads.kind,
    })
    .from(pomodoroMediaUploads)
    .innerJoin(
      customShellMedia,
      eq(customShellMedia.id, pomodoroMediaUploads.mediaId)
    )
    .where(
      and(
        eq(pomodoroMediaUploads.mediaId, reference.mediaId),
        eq(pomodoroMediaUploads.userId, userId),
        // A picture in the bin is never shown, here or anywhere.
        isNull(pomodoroMediaUploads.deletedAt)
      )
    )
    .limit(1)
  // A video banner is out of scope, so only a finished picture draws.
  if (!row || row.status !== "ready" || row.kind !== "image") return null
  return getPublicMediaUrl(row.storagePath)
}

/**
 * The badges an account still holds: every earned row except the ones an
 * admin took away (admin task 06), which stay on record so they are never
 * awarded again.
 */
function badgesKeptBy(userId: string) {
  return and(
    eq(pomodoroAchievements.userId, userId),
    isNull(pomodoroAchievements.revokedAt)
  )
}

/** Every badge the account has on record, named from the code list. */
async function readBadges(userId: string): Promise<PublicProfileBadge[]> {
  const rows = await db
    .select({
      badgeId: pomodoroAchievements.badgeId,
      earnedAt: pomodoroAchievements.earnedAt,
    })
    .from(pomodoroAchievements)
    .where(badgesKeptBy(userId))
    .orderBy(pomodoroAchievements.earnedAt)

  const badges: PublicProfileBadge[] = []
  for (const row of rows) {
    // A badge whose id is no longer in the code list is left out rather than
    // drawn nameless. `workspace/docs/achievements.md` is why that can only
    // happen if somebody changes an id, which is the thing not to do.
    const badge = findAchievement(row.badgeId)
    if (!badge) continue
    badges.push({
      id: badge.id,
      name: badge.name,
      description: badge.description,
      earnedOn: row.earnedAt.toISOString(),
    })
  }
  return badges
}

/** Hours, sessions and both streaks, over the life of the account. */
async function readFigures(
  userId: string,
  todayLocalDate: string
): Promise<PublicProfileFigures> {
  // `loadFocusStreaks` is the same function the badges panel and the streak
  // badge use, so the streak on a profile can never disagree with the one on
  // the dashboard.
  const [[totals], streaks] = await Promise.all([
    db
      .select({
        seconds: sql<number>`coalesce(sum(${dailyFocusStats.focusSeconds}), 0)::bigint`,
        sessions: sql<number>`coalesce(sum(${dailyFocusStats.focusSessions}), 0)::int`,
      })
      .from(dailyFocusStats)
      .where(eq(dailyFocusStats.userId, userId)),
    loadFocusStreaks(userId, todayLocalDate),
  ])

  return {
    // Whole hours down, so the page never claims an hour nobody focused.
    focusHours: Math.floor(Number(totals?.seconds ?? 0) / 3_600),
    focusSessions: Number(totals?.sessions ?? 0),
    ...streaks,
  }
}

/** The last 365 days of squares, in the account's own timezone. */
async function readHeatmap(
  userId: string,
  todayLocalDate: string
) {
  const startDate = shiftLocalDate(todayLocalDate, -364)
  const days = await db
    .select({
      localDate: dailyFocusStats.localDate,
      focusSeconds: dailyFocusStats.focusSeconds,
    })
    .from(dailyFocusStats)
    .where(
      and(
        eq(dailyFocusStats.userId, userId),
        gte(dailyFocusStats.localDate, startDate),
        lte(dailyFocusStats.localDate, todayLocalDate)
      )
    )
    .orderBy(dailyFocusStats.localDate)
  return { startDate, endDate: todayLocalDate, days }
}

/**
 * The projects the account logged focus against in the last seven days, and
 * only the ones ticked public. A session reaches a project through its task,
 * so a session on no task never appears here at all.
 */
async function readPublicProjects(
  userId: string,
  todayLocalDate: string,
  timezone: string
) {
  const startsAt = localDateStartInstant(
    timezone,
    shiftLocalDate(todayLocalDate, -6)
  )
  const endsBefore = localDateStartInstant(
    timezone,
    shiftLocalDate(todayLocalDate, 1)
  )
  const rows = await db
    .select({
      name: pomodoroProjects.name,
      focusSeconds: sql<number>`coalesce(sum(${focusSessions.accumulatedSeconds}), 0)::int`,
    })
    .from(focusSessions)
    .innerJoin(tasks, eq(tasks.id, focusSessions.taskId))
    .innerJoin(
      pomodoroProjects,
      eq(pomodoroProjects.id, tasks.projectId)
    )
    .where(
      and(
        completedFocusWithin(userId, startsAt, endsBefore),
        eq(pomodoroProjects.isPublic, true)
      )
    )
    .groupBy(pomodoroProjects.id, pomodoroProjects.name)
    .orderBy(desc(sql`sum(${focusSessions.accumulatedSeconds})`))
    .limit(8)
  return rows
}

/**
 * The line that says somebody is mid-session, or null.
 *
 * A session only counts while it is running and its own clock has not run
 * out. A focus left open overnight has `targetEndsAt` in the past, so it
 * reads as not focusing rather than claiming a fourteen-hour session.
 *
 * Nothing about the work comes back: no task, no project, no note.
 */
async function readFocusingNow(userId: string, now: Date) {
  const [row] = await db
    .select({
      mode: focusSessions.mode,
      targetEndsAt: focusSessions.targetEndsAt,
    })
    .from(focusSessions)
    .where(
      and(
        eq(focusSessions.userId, userId),
        eq(focusSessions.status, "running"),
        gt(focusSessions.targetEndsAt, now)
      )
    )
    .orderBy(desc(focusSessions.targetEndsAt))
    .limit(1)
  if (!row?.targetEndsAt) return null
  return {
    mode: row.mode as "focus" | "short" | "long",
    // The end itself rather than the minutes left. The page is held for 30
    // seconds, so a count taken when it was assembled is already stale for
    // the next visitor; the end time is true whenever it is read.
    endsAt: row.targetEndsAt.toISOString(),
  }
}

/** Phases that mean a room is open now. */
const OPEN_ROOM_PHASES = ["waiting", "focus", "short", "long"]

/**
 * The room this account is hosting, if it is a public one.
 *
 * The room's own `visibility` decides, not the profile's switch. Unlisted
 * means not listed, and a profile is a listing.
 */
async function readHostedRoom(userId: string) {
  const [row] = await db
    .select({
      slug: rooms.slug,
      name: rooms.name,
      phase: rooms.phase,
    })
    .from(rooms)
    .where(
      and(
        eq(rooms.hostUserId, userId),
        eq(rooms.visibility, "public"),
        // Both halves, because everywhere else in this app treats a room as
        // closed when either one says so, and the public rooms list keys on
        // `closedAt` rather than the phase. Checking only the phase would
        // put a Join button on a room that refuses the join.
        isNull(rooms.closedAt),
        inArray(rooms.phase, OPEN_ROOM_PHASES)
      )
    )
    .orderBy(desc(rooms.createdAt))
    .limit(1)
  return row ?? null
}

/**
 * Everything `/u/<handle>` draws, or null when there is no such page.
 *
 * Every section runs in one `Promise.all`, so the whole page is one trip to
 * the database rather than a ladder of them, and a section whose switch is
 * off contributes no query at all.
 */
export async function readPublicProfile(
  handle: string,
  viewerUserId: string | null = null,
  now = Date.now()
): Promise<PublicProfileView | null> {
  // Anything not shaped like a handle is turned away before the database is
  // asked, which is what keeps a NUL byte from reaching Postgres.
  if (!isHandleAvailableShape(handle)) return null

  let held = readHeld(profileCache, handle, now)
  if (held === undefined) {
    held = await buildPublicProfile(handle, new Date(now))
    writeHeld(profileCache, handle, held, PROFILE_CACHE_MS, now)
  }
  if (!held.view || !held.ownerUserId) return null

  // The block is checked outside the held page, because the page is the same
  // for everybody and a block is between two accounts. A signed-out visitor
  // has blocked nobody, so this costs nothing on the common path.
  if (await isBlockedBetween(viewerUserId, held.ownerUserId)) return null
  // Worked out per reader rather than held, because the held page is the same
  // one for everybody.
  return {
    ...held.view,
    shared: held.showSharedMedia
      ? await readSharedForProfile(held.ownerUserId, viewerUserId)
      : null,
    isOwner: viewerUserId === held.ownerUserId,
  }
}

/** The newest shared sounds and backgrounds for the profile's two cards. */
async function readSharedForProfile(
  ownerUserId: string,
  viewerUserId: string | null
) {
  const [sounds, backgrounds] = await Promise.all(
    (["sound", "background"] as const).map((purpose) =>
      listSharedMedia({
        viewerUserId,
        purpose,
        ownerUserId,
        pageSize: PROFILE_SHARED_COUNT,
      })
    )
  )
  return {
    sounds: { items: sounds.items, total: sounds.total },
    backgrounds: { items: backgrounds.items, total: backgrounds.total },
  }
}

async function buildPublicProfile(
  handle: string,
  now: Date
): Promise<HeldProfile> {
  const profile = await readProfileRow(handle)
  if (!profile) return { view: null, ownerUserId: null, showSharedMedia: false }

  const todayLocalDate = localDateFor(profile.timezone, now)
  const userId = profile.userId

  const [
    bannerUrl,
    figures,
    badges,
    heatmap,
    projects,
    focusingNow,
    room,
    [followerRow],
    [followingRow],
  ] = await Promise.all([
      resolveBannerUrl(userId, profile.bannerRef),
      profile.showFigures ? readFigures(userId, todayLocalDate) : null,
      profile.showBadges ? readBadges(userId) : null,
      profile.showHeatmap ? readHeatmap(userId, todayLocalDate) : null,
      profile.showProjects
        ? readPublicProjects(userId, todayLocalDate, profile.timezone)
        : null,
      profile.showFocusingNow ? readFocusingNow(userId, now) : null,
      profile.showRoom ? readHostedRoom(userId) : null,
      // Counted once each, in the same batch. A count per row is the shape
      // that turns one page into one query per follower.
      db
        .select({ value: count() })
        .from(pomodoroFollows)
        .where(eq(pomodoroFollows.followedUserId, userId)),
      db
        .select({ value: count() })
        .from(pomodoroFollows)
        .where(eq(pomodoroFollows.followerUserId, userId)),
    ])
  const followers = followerRow?.value ?? 0
  const following = followingRow?.value ?? 0

  // Pinned ids are filtered against what the account has actually earned, so
  // a pin for a badge an operator later removed leaves no gap on the page.
  const earnedIds = new Set((badges ?? []).map((badge) => badge.id))
  const pinnedBadgeIds = readPinnedBadges(profile.pinnedBadges).filter((id) =>
    earnedIds.has(id)
  )

  const currentYear = Number(todayLocalDate.slice(0, 4))
  const recapYears = profile.showFigures
    ? [currentYear, currentYear - 1].filter((year) => year >= FIRST_RECAP_YEAR)
    : []

  return {
    ownerUserId: userId,
    showSharedMedia: profile.showSharedMedia,
    view: {
    handle,
    name: profile.displayName?.trim() || handle,
    bio: profile.bio?.trim() || null,
    avatarUrl: profile.avatarUrl,
    bannerUrl,
    // Read back through the same normalizer that wrote them, so a row edited
    // by hand cannot put a `javascript:` address on a page.
    socialLinks: normalizePublicSocialLinks(profile.socialLinks),
    figures,
    badges,
    pinnedBadgeIds,
    heatmap,
    projects,
    focusingNow,
    room,
    recapYears,
    followers,
    following,
    // Both replaced per reader in `readPublicProfile`; the held copy is
    // nobody's.
    shared: null,
    isOwner: false,
    },
  }
}

/** The stored pins, cleaned: strings only, known badges only, at most three. */
function readPinnedBadges(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const pins: string[] = []
  for (const entry of value) {
    if (pins.length >= MAX_PINNED_BADGES) break
    if (typeof entry !== "string") continue
    if (!findAchievement(entry)) continue
    if (pins.includes(entry)) continue
    pins.push(entry)
  }
  return pins
}

/**
 * One year, summed, at `/u/<handle>/<year>`.
 *
 * It rides on the figures switch, because every number on it is one of the
 * figures. A year under the floor comes back with `tooEarly` set and nothing
 * filled, which is the short line rather than a page of near-zeros.
 */
export async function readYearInReview(
  handle: string,
  year: number,
  viewerUserId: string | null = null,
  now = Date.now()
): Promise<YearInReviewView | null> {
  if (!isHandleAvailableShape(handle)) return null
  if (!Number.isInteger(year) || year < FIRST_RECAP_YEAR) return null

  // The recap is the profile one year at a time, so a block hides it for the
  // same reason and with the same 404. Checked before the held copy, which is
  // the same page for every reader.
  const [owner] = await db
    .select({ userId: pomodoroProfiles.userId })
    .from(pomodoroProfiles)
    .where(eq(pomodoroProfiles.handle, handle))
    .limit(1)
  if (owner && (await isBlockedBetween(viewerUserId, owner.userId))) return null

  const key = `${handle}:${year}`
  const held = readHeld(recapCache, key, now)
  if (held !== undefined) return held

  const { view, finished } = await buildYearInReview(handle, year, new Date(now))
  writeHeld(
    recapCache,
    key,
    view,
    // A year that has ended never changes again. The running year still
    // does, every time somebody finishes a focus. "Ended" is read off the
    // account's own clock, which is the clock every figure on the page used.
    finished ? FINISHED_YEAR_CACHE_MS : PROFILE_CACHE_MS,
    now
  )
  return view
}

async function buildYearInReview(
  handle: string,
  year: number,
  now: Date
): Promise<{ view: YearInReviewView | null; finished: boolean }> {
  const profile = await readProfileRow(handle)
  if (!profile || !profile.showFigures) return { view: null, finished: false }

  const todayLocalDate = localDateFor(profile.timezone, now)
  const currentYear = Number(todayLocalDate.slice(0, 4))
  // A year that has not started yet has no page.
  if (year > currentYear) return { view: null, finished: false }
  const finished = year < currentYear

  const startDate = `${year}-01-01`
  const endDate = `${year}-12-31`
  const userId = profile.userId

  const [days, badgeRows] = await Promise.all([
    db
      .select({
        localDate: dailyFocusStats.localDate,
        focusSeconds: dailyFocusStats.focusSeconds,
        focusSessions: dailyFocusStats.focusSessions,
        tasksCompleted: dailyFocusStats.tasksCompleted,
      })
      .from(dailyFocusStats)
      .where(
        and(
          eq(dailyFocusStats.userId, userId),
          gte(dailyFocusStats.localDate, startDate),
          lte(dailyFocusStats.localDate, endDate)
        )
      )
      .orderBy(dailyFocusStats.localDate),
    db
      .select({
        badgeId: pomodoroAchievements.badgeId,
        earnedAt: pomodoroAchievements.earnedAt,
      })
      .from(pomodoroAchievements)
      .where(badgesKeptBy(userId))
      .orderBy(pomodoroAchievements.earnedAt),
  ])

  let focusSecondsTotal = 0
  let focusSessionsTotal = 0
  let tasksCompletedTotal = 0
  const byMonth = new Map<string, number>()
  for (const day of days) {
    focusSecondsTotal += day.focusSeconds
    focusSessionsTotal += day.focusSessions
    tasksCompletedTotal += day.tasksCompleted
    const month = day.localDate.slice(0, 7)
    byMonth.set(month, (byMonth.get(month) ?? 0) + day.focusSeconds)
  }

  const focusHours = Math.floor(focusSecondsTotal / 3_600)
  const name = profile.displayName?.trim() || handle

  if (focusHours < RECAP_MIN_FOCUS_HOURS) {
    return {
      view: {
        handle,
        name,
        year,
        tooEarly: true,
        focusHours: 0,
        focusSessions: 0,
        tasksCompleted: 0,
        bestStreak: 0,
        busiestMonth: null,
        badges: [],
      },
      finished,
    }
  }

  // The best streak inside the year, measured against its last day, so a
  // finished year's figure never changes again.
  const lastDay = finished ? endDate : todayLocalDate
  const { bestStreak } = calculateFocusStreaks(
    days.filter((day) => day.focusSessions > 0).map((day) => day.localDate),
    lastDay
  )

  let busiestMonth: YearInReviewView["busiestMonth"] = null
  for (const [month, seconds] of byMonth) {
    const hours = Math.floor(seconds / 3_600)
    if (!busiestMonth || hours > busiestMonth.focusHours)
      busiestMonth = { month, focusHours: hours }
  }

  const badges: PublicProfileBadge[] = []
  for (const row of badgeRows) {
    // The account's own timezone, like every other figure on this page. In
    // UTC a badge earned at 20:00 on 31 December in New York lands in the
    // next year and vanishes from both recaps.
    if (localDateFor(profile.timezone, row.earnedAt).slice(0, 4) !== String(year))
      continue
    const badge = findAchievement(row.badgeId)
    if (!badge) continue
    badges.push({
      id: badge.id,
      name: badge.name,
      description: badge.description,
      earnedOn: row.earnedAt.toISOString(),
    })
  }

  return {
    view: {
      handle,
      name,
      year,
      tooEarly: false,
      focusHours,
      focusSessions: focusSessionsTotal,
      tasksCompleted: tasksCompletedTotal,
      bestStreak,
      busiestMonth,
      badges,
    },
    finished,
  }
}

/**
 * The owner's own view of their public profile, for the Settings card. It
 * carries the handle and every switch whether the page is on or off, which is
 * the whole difference from the public read above.
 */
export async function loadMyPublicProfile(
  userId: string,
  browserTimezone: string
) {
  // The one way a profile row is ever created, the same call
  // `loadPomodoroProfile` makes. The save below is then a plain UPDATE, so
  // this endpoint never becomes a second creation path that writes a
  // timezone nobody chose.
  await loadOrCreateProfile(userId, browserTimezone)
  return readMyPublicProfile(userId)
}

/** The same row, for a caller that already knows the profile exists. */
async function readMyPublicProfile(userId: string) {
  const [[row], earned] = await Promise.all([
    db
      .select({
        handle: pomodoroProfiles.handle,
        profilePublic: pomodoroProfiles.profilePublic,
        bio: pomodoroProfiles.bio,
        socialLinks: pomodoroProfiles.socialLinks,
        bannerRef: pomodoroProfiles.bannerRef,
        pinnedBadges: pomodoroProfiles.pinnedBadges,
        showFigures: pomodoroProfiles.showFigures,
        showBadges: pomodoroProfiles.showBadges,
        showHeatmap: pomodoroProfiles.showHeatmap,
        showProjects: pomodoroProfiles.showProjects,
        showFocusingNow: pomodoroProfiles.showFocusingNow,
        showRoom: pomodoroProfiles.showRoom,
        showSharedMedia: pomodoroProfiles.showSharedMedia,
        listed: pomodoroProfiles.listed,
        cheersEnabled: pomodoroProfiles.cheersEnabled,
        hiddenAt: pomodoroProfiles.hiddenAt,
      })
      .from(pomodoroProfiles)
      .where(eq(pomodoroProfiles.userId, userId))
      .limit(1),
    db
      .select({ badgeId: pomodoroAchievements.badgeId })
      .from(pomodoroAchievements)
      .where(badgesKeptBy(userId)),
  ])

  return {
    handle: row?.handle ?? null,
    profilePublic: row?.profilePublic ?? false,
    bio: row?.bio ?? "",
    socialLinks: normalizePublicSocialLinks(row?.socialLinks),
    bannerRef: row?.bannerRef ?? null,
    pinnedBadges: readPinnedBadges(row?.pinnedBadges),
    showFigures: row?.showFigures ?? false,
    showBadges: row?.showBadges ?? false,
    showHeatmap: row?.showHeatmap ?? false,
    showProjects: row?.showProjects ?? false,
    showFocusingNow: row?.showFocusingNow ?? false,
    showRoom: row?.showRoom ?? false,
    showSharedMedia: row?.showSharedMedia ?? false,
    listed: row?.listed ?? false,
    cheersEnabled: row?.cheersEnabled ?? true,
    /** Set when an operator hid the page. The card says so plainly. */
    hiddenAt: row?.hiddenAt ?? null,
    /** What may be pinned. The card offers only badges already earned. */
    earnedBadgeIds: earned
      .map((badge) => badge.badgeId)
      .filter((id) => findAchievement(id)),
  }
}

export type PublicProfileChanges = {
  handle: string | null
  profilePublic: boolean
  bio: string | null
  socialLinks: PublicSocialLink[]
  bannerRef: string | null
  pinnedBadges: string[]
  showFigures: boolean
  showBadges: boolean
  showHeatmap: boolean
  showProjects: boolean
  showFocusingNow: boolean
  showRoom: boolean
  showSharedMedia: boolean
  listed: boolean
  cheersEnabled: boolean
}

const HANDLE_UNIQUE_CODE = "23505"

/**
 * Drizzle wraps the driver's error in one of its own, and the two drivers
 * this app runs on nest it differently, so the chain is walked. Same shape as
 * `isDuplicateName` in `projects.ts`.
 */
export function isDuplicateHandle(error: unknown) {
  for (let step: unknown = error, depth = 0; step && depth < 5; depth += 1) {
    if (typeof step !== "object") return false
    if ((step as { code?: string }).code === HANDLE_UNIQUE_CODE) return true
    step = (step as { cause?: unknown }).cause
  }
  return false
}

/**
 * Saves the owner's public profile.
 *
 * The handle's shape and the reserved list are checked here as well as in the
 * browser, because the browser is not where a rule lives. Two people claiming
 * one handle in the same instant is settled by the unique index rather than
 * by a read-then-write, which has a gap between the two.
 */
export async function saveMyPublicProfile(
  userId: string,
  changes: PublicProfileChanges
) {
  if (changes.handle !== null && !isHandleAvailableShape(changes.handle))
    throw new Error("INVALID_HANDLE")
  // A page with no address cannot be switched on, and saying so beats
  // switching it on to a 404.
  if (changes.profilePublic && !changes.handle)
    throw new Error("HANDLE_REQUIRED")

  const banner = parseBackgroundReference(changes.bannerRef)
  // Tyler's call, 2 Oct 2026: the eight scenes are free and your own picture
  // is a Pro perk, which is how every other own-upload in this app already
  // works. `requirePomodoroPerk` throws UPGRADE_REQUIRED:uploadMedia.
  if (banner?.type === "media")
    await requirePomodoroPerk(userId, "uploadMedia")
  if (banner?.type === "scene" && !findTheme(await loadMediaCatalog(), banner.key))
    throw new Error("UNKNOWN_BACKGROUND")

  const [previous] = await db
    .select({ handle: pomodoroProfiles.handle })
    .from(pomodoroProfiles)
    .where(eq(pomodoroProfiles.userId, userId))
    .limit(1)

  const values = {
    handle: changes.handle,
    profilePublic: changes.profilePublic,
    bio: changes.bio?.trim() || null,
    socialLinks: normalizePublicSocialLinks(changes.socialLinks),
    // Parsed and written back out, so only `scene:<key>` for a scene that
    // exists or `media:<uuid>` can ever be stored.
    bannerRef: serializeBackgroundReference(banner),
    pinnedBadges: readPinnedBadges(changes.pinnedBadges),
    showFigures: changes.showFigures,
    showBadges: changes.showBadges,
    showHeatmap: changes.showHeatmap,
    showProjects: changes.showProjects,
    showFocusingNow: changes.showFocusingNow,
    showRoom: changes.showRoom,
    showSharedMedia: changes.showSharedMedia,
    listed: changes.listed,
    cheersEnabled: changes.cheersEnabled,
  }

  try {
    // An UPDATE rather than an upsert, the same shape as `enableStreakBadge`.
    // The row always exists by now because the card loads through
    // `loadMyPublicProfile` before it can save, and an upsert here would be a
    // second way to create a profile — one that has no browser timezone to
    // write and would quietly save UTC.
    const [updated] = await db
      .update(pomodoroProfiles)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(pomodoroProfiles.userId, userId))
      .returning({ userId: pomodoroProfiles.userId })
    if (!updated) throw new Error("PROFILE_NOT_FOUND")
  } catch (error) {
    if (isDuplicateHandle(error)) throw new Error("HANDLE_TAKEN")
    throw error
  }

  // Both the old handle and the new one, so renaming does not leave the old
  // address answering from memory after it stops resolving.
  forgetPublicProfile(previous?.handle ?? null)
  forgetPublicProfile(changes.handle)
  // The directory is held for five minutes, and a listing switched on or off
  // should take effect on the next load rather than after the window.
  forgetUsersPages()
  return readMyPublicProfile(userId)
}

/**
 * The `/users` directory: profiles whose owners asked to be listed.
 *
 * Two switches have to be on, not one. `profilePublic` makes the page exist;
 * `listed` puts it in a directory other people browse. They are different
 * wishes, the same reasoning that keeps a group board and the global board
 * apart, and a public list of members is a scrapable list of members.
 *
 * Two orders, from Tyler's design of 8 Oct 2026: Most focused (the default)
 * and Newest. Somebody who keeps their figures private counts as nought for
 * Most focused, so they sort to the end rather than being left out. A third
 * tab, Online now, is Most focused narrowed to the people focusing this
 * minute who chose to show it ("Focusing right now" on their profile);
 * nobody's presence is shown without that switch. A search matches the
 * display name or the handle.
 *
 * Held per order, search and page, five minutes (30 seconds for Online now),
 * so no visitor causes a per-row read.
 */
const USERS_PAGE_SIZE = 24
const USERS_CACHE_MS = 5 * 60_000
const ONLINE_CACHE_MS = 30_000

export type UserDirectoryRow = {
  handle: string
  name: string
  avatarUrl: string | null
  bio: string | null
  /** Null when that person keeps their figures private. */
  focusHours: number | null
}

/**
 * A held row, with the account it belongs to.
 *
 * The id is kept so a signed-in reader's blocks can be applied to the shared
 * page without reading it again per visitor, and it is stripped before the
 * rows leave the server. Same move as the held profile's `ownerUserId`.
 */
type HeldUserRow = UserDirectoryRow & { userId: string }

type HeldUsers = { rows: HeldUserRow[]; total: number; expiresAt: number }
const usersCache = new Map<string, HeldUsers>()

export async function readUsersPage(
  page = 0,
  viewerUserId: string | null = null,
  { sort = "focused", search = "" }: { sort?: UserSort; search?: string } = {},
  now = Date.now()
) {
  const safePage = Math.max(0, Math.min(page, 200))
  const term = search.trim().toLowerCase().slice(0, USER_SEARCH_MAX_LENGTH)
  const cacheKey = `${sort}|${term}|${safePage}`
  const held = usersCache.get(cacheKey)
  if (held && held.expiresAt > now)
    return shapeUsers(held, safePage, viewerUserId)

  // The search is a plain substring of the name or handle. `%` and `_` are
  // escaped so a typed one is a character, not a wildcard.
  const pattern = `%${term.replace(/[\\%_]/g, (char) => `\\${char}`)}%`
  const listed = and(
    eq(pomodoroProfiles.profilePublic, true),
    eq(pomodoroProfiles.listed, true),
    isNull(pomodoroProfiles.hiddenAt),
    // The same test as the profile's "Focusing now": a running session whose
    // own clock has not run out, so a focus left open overnight is not online.
    sort === "online"
      ? and(
          eq(pomodoroProfiles.showFocusingNow, true),
          sql`exists (select 1 from ${focusSessions} where ${focusSessions.userId} = ${pomodoroProfiles.userId} and ${focusSessions.status} = 'running' and ${focusSessions.targetEndsAt} > ${new Date(now).toISOString()}::timestamptz)`
        )
      : undefined,
    term
      ? sql`(lower(coalesce(${pomodoroProfiles.publicDisplayName}, '')) like ${pattern} or lower(coalesce(${pomodoroProfiles.handle}, '')) like ${pattern})`
      : undefined
  )
  const shownFocus = sql`case when ${pomodoroProfiles.showFigures} then coalesce(sum(${dailyFocusStats.focusSeconds}), 0) else 0 end`

  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        userId: pomodoroProfiles.userId,
        handle: pomodoroProfiles.handle,
        name: pomodoroProfiles.publicDisplayName,
        bio: pomodoroProfiles.bio,
        avatarUrl: customShellUsers.avatarUrl,
        showFigures: pomodoroProfiles.showFigures,
        // One headline figure, summed in the same query rather than a read
        // per row. Zero when that person keeps their figures private.
        focusSeconds: sql<number>`coalesce(sum(${dailyFocusStats.focusSeconds}), 0)::bigint`,
        createdAt: sql<string>`min(${customShellUsers.createdAt})`,
      })
      .from(pomodoroProfiles)
      .innerJoin(
        customShellUsers,
        eq(customShellUsers.id, pomodoroProfiles.userId)
      )
      .leftJoin(
        dailyFocusStats,
        eq(dailyFocusStats.userId, pomodoroProfiles.userId)
      )
      .where(listed)
      .groupBy(
        pomodoroProfiles.userId,
        pomodoroProfiles.handle,
        pomodoroProfiles.publicDisplayName,
        pomodoroProfiles.bio,
        pomodoroProfiles.showFigures,
        customShellUsers.avatarUrl
      )
      .orderBy(
        ...(sort !== "newest"
          ? [desc(shownFocus), desc(sql`min(${customShellUsers.createdAt})`)]
          : [desc(sql`min(${customShellUsers.createdAt})`)])
      )
      .limit(USERS_PAGE_SIZE)
      .offset(safePage * USERS_PAGE_SIZE),
    db
      .select({ value: count() })
      .from(pomodoroProfiles)
      .where(listed),
  ])

  const listedUsers: HeldUserRow[] = rows
    .filter((row): row is typeof row & { handle: string } => Boolean(row.handle))
    .map((row) => ({
      userId: row.userId,
      handle: row.handle,
      name: row.name?.trim() || row.handle,
      avatarUrl: row.avatarUrl,
      bio: row.bio?.trim() || null,
      focusHours: row.showFigures
        ? Math.floor(Number(row.focusSeconds ?? 0) / 3_600)
        : null,
    }))

  const total = totalRow?.value ?? 0
  if (usersCache.size >= 50) {
    const oldest = usersCache.keys().next()
    if (!oldest.done) usersCache.delete(oldest.value)
  }
  // Online now changes by the minute, so it is held for 30 seconds, the same
  // as a profile's "Focusing now".
  const entry = {
    rows: listedUsers,
    total,
    expiresAt: now + (sort === "online" ? ONLINE_CACHE_MS : USERS_CACHE_MS),
  }
  usersCache.set(cacheKey, entry)
  return shapeUsers(entry, safePage, viewerUserId)
}

/**
 * Strips the ids off a held page and drops anybody the reader has blocked or
 * who has blocked them.
 *
 * The expensive part — the rows themselves — stays shared and held, so a
 * visitor still causes no per-row read. A signed-in reader pays one small
 * query for their own block list; a signed-out one pays nothing, because they
 * have blocked nobody.
 */
async function shapeUsers(
  entry: HeldUsers,
  page: number,
  viewerUserId: string | null
) {
  const visibleIds = entry.rows.map((row) => row.userId)
  const [blocked, followed] = await Promise.all([
    blockedUserIdsFor(viewerUserId),
    // Whom the reader follows among this page, one query, so each card's
    // Follow button starts in the right state. Nothing for a signed-out one.
    viewerUserId && visibleIds.length
      ? db
          .select({ id: pomodoroFollows.followedUserId })
          .from(pomodoroFollows)
          .where(
            and(
              eq(pomodoroFollows.followerUserId, viewerUserId),
              inArray(pomodoroFollows.followedUserId, visibleIds)
            )
          )
          .then((rows) => new Set(rows.map((row) => row.id)))
      : Promise.resolve(new Set<string>()),
  ])
  return {
    rows: entry.rows
      .filter((row) => !blocked.has(row.userId))
      .map(({ userId, ...row }) => ({
        ...row,
        /** The reader's own card, which says YOU and has no Follow. */
        mine: userId === viewerUserId,
        /** Null for a signed-out reader, who follows nobody. */
        following: viewerUserId ? followed.has(userId) : null,
      })),
    total: entry.total,
    page,
    pageSize: USERS_PAGE_SIZE,
  }
}

/** Drops every held page of the directory, after a listing switch changes. */
export function forgetUsersPages() {
  usersCache.clear()
}

/**
 * Every listed profile's address, for the sitemap.
 *
 * Only listed ones. A profile somebody switched on but did not list stays
 * reachable by its address and out of search results, which is the whole
 * point of the second switch.
 */
export async function listedProfilePaths() {
  const rows = await db
    .select({ handle: pomodoroProfiles.handle })
    .from(pomodoroProfiles)
    .where(
      and(
        eq(pomodoroProfiles.profilePublic, true),
        eq(pomodoroProfiles.listed, true),
        isNull(pomodoroProfiles.hiddenAt)
      )
    )
    .limit(5_000)
  return rows
    .map((row) => row.handle)
    .filter((handle): handle is string => Boolean(handle))
    .map((handle) => ({ path: `/u/${handle}` }))
}
