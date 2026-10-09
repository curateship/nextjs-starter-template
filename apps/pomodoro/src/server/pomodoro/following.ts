import { and, count, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm"

import { findAchievement } from "@/lib/pomodoro/achievements"
import { CHEERS_PER_DAY, findCheer } from "@/lib/pomodoro/cheers"
import { MAX_FOLLOWING } from "@/lib/pomodoro/following"
import {
  cheerNoticeMessage,
  followedStreakMessage,
  noticeName,
} from "@/lib/pomodoro/notices"
import { db } from "@/server/db"
import { blockedUserIdsFor, isBlockedBetween } from "@/server/pomodoro/blocks"
import { followersToTell, writeNotices } from "@/server/pomodoro/notices"
import { forgetPublicProfile } from "@/server/pomodoro/public-profile"
import {
  pomodoroAchievements,
  pomodoroCheers,
  pomodoroFollows,
  pomodoroProfiles,
} from "@/server/pomodoro/schema"

/**
 * Following, and the two things it carries: a short list of what the people
 * you follow did, and a canned cheer.
 *
 * **A handle is how somebody is followed, never a user id.** Every function
 * here takes a handle from the browser and resolves it against a switched-on
 * profile, so an id is never a thing the client holds or sends.
 *
 * **One query per page, never one per followed account.** The feed and the
 * counts are the two easiest places in this app to write a query that runs
 * once per row on every load, so both are written as one query and the feed
 * is held for a few minutes on top.
 *
 * **A block is checked here as it is everywhere**, through
 * `@/server/pomodoro/blocks`. A blocked account cannot be followed, does not
 * appear in a feed, and a cheer aimed at one is accepted and dropped.
 */

/** The followed account behind a handle, or null when there is no such page. */
async function followableUser(handle: string) {
  const [row] = await db
    .select({ userId: pomodoroProfiles.userId })
    .from(pomodoroProfiles)
    .where(
      and(
        eq(pomodoroProfiles.handle, handle),
        eq(pomodoroProfiles.profilePublic, true),
        isNull(pomodoroProfiles.hiddenAt)
      )
    )
    .limit(1)
  return row?.userId ?? null
}

/**
 * Follows the account behind a handle.
 *
 * "No such profile" and "you may not follow this one" answer identically, the
 * rule the groups work already follows, so nobody can use a refusal to learn
 * that an account exists or that they have been blocked.
 */
export async function followByHandle(followerUserId: string, handle: string) {
  const followedUserId = await followableUser(handle)
  if (!followedUserId) throw new Error("PROFILE_NOT_FOUND")
  if (followedUserId === followerUserId) throw new Error("CANNOT_FOLLOW_SELF")
  if (await isBlockedBetween(followerUserId, followedUserId))
    throw new Error("PROFILE_NOT_FOUND")

  const [{ value: already }] = await db
    .select({ value: count() })
    .from(pomodoroFollows)
    .where(eq(pomodoroFollows.followerUserId, followerUserId))
  if (already >= MAX_FOLLOWING) throw new Error("FOLLOWING_FULL")

  // The unique index decides, so a double-pressed Follow is one row rather
  // than a read-then-write two tabs could both pass.
  await db
    .insert(pomodoroFollows)
    .values({ followerUserId, followedUserId })
    .onConflictDoNothing()
  // The follower count is part of the held page, so the page has to be
  // rebuilt or the number stays wrong for the length of the window.
  forgetPublicProfile(handle)
  return { following: true }
}

export async function unfollowByHandle(followerUserId: string, handle: string) {
  const followedUserId = await followableUser(handle)
  // Unfollowing a profile that has since gone is not an error: the follow row
  // is what matters and it is keyed on ids, so nothing is left behind.
  if (!followedUserId) return { following: false }
  await db
    .delete(pomodoroFollows)
    .where(
      and(
        eq(pomodoroFollows.followerUserId, followerUserId),
        eq(pomodoroFollows.followedUserId, followedUserId)
      )
    )
  forgetPublicProfile(handle)
  return { following: false }
}

/** Whether the viewer follows this handle, for the button's own state. */
export async function isFollowing(followerUserId: string, handle: string) {
  const followedUserId = await followableUser(handle)
  if (!followedUserId) return false
  const [row] = await db
    .select({ id: pomodoroFollows.id })
    .from(pomodoroFollows)
    .where(
      and(
        eq(pomodoroFollows.followerUserId, followerUserId),
        eq(pomodoroFollows.followedUserId, followedUserId)
      )
    )
    .limit(1)
  return Boolean(row)
}

/**
 * Every account the viewer follows, minus anyone blocked in either direction.
 *
 * The Following board and the feed both start here, so neither can ever show
 * somebody the other hides.
 */
export async function followedUserIds(viewerUserId: string) {
  const [rows, blocked] = await Promise.all([
    db
      .select({ userId: pomodoroFollows.followedUserId })
      .from(pomodoroFollows)
      .where(eq(pomodoroFollows.followerUserId, viewerUserId))
      .limit(MAX_FOLLOWING),
    blockedUserIdsFor(viewerUserId),
  ])
  return rows
    .map((row) => row.userId)
    .filter((userId) => !blocked.has(userId))
}

export type FollowingEventRow = {
  name: string
  handle: string | null
  kind: "badge"
  label: string
  earnedOn: string
}

/**
 * The last ten badges earned by the people the viewer follows.
 *
 * Held for a few minutes per viewer, because this is drawn on a screen people
 * leave open. One query covers every followed account; there is no per-row
 * read anywhere in here.
 *
 * Only what each person's own profile already publishes: the feed reads the
 * `showBadges` switch, so it can never show a badge their profile hides.
 */
const FEED_CACHE_MS = 3 * 60_000
const FEED_LIMIT = 10
/**
 * A ceiling on held feeds, so a process serving many signed-in members cannot
 * grow this map without bound. Every other cache in this app carries one; this
 * is keyed per viewer rather than per handle, so it needs one most of all.
 */
const FEED_CACHE_LIMIT = 500
const feedCache = new Map<
  string,
  { rows: FollowingEventRow[]; expiresAt: number }
>()

export async function readFollowingFeed(
  viewerUserId: string,
  now = Date.now()
): Promise<FollowingEventRow[]> {
  const held = feedCache.get(viewerUserId)
  if (held && held.expiresAt > now) return held.rows

  const followed = await followedUserIds(viewerUserId)
  // Following nobody costs no query at all, which is the common case on a
  // screen most people never use.
  if (!followed.length) {
    writeFeed(viewerUserId, [], now)
    return []
  }

  const rows = await db
    .select({
      name: pomodoroProfiles.publicDisplayName,
      handle: pomodoroProfiles.handle,
      badgeId: pomodoroAchievements.badgeId,
      earnedAt: pomodoroAchievements.earnedAt,
    })
    .from(pomodoroAchievements)
    .innerJoin(
      pomodoroProfiles,
      eq(pomodoroProfiles.userId, pomodoroAchievements.userId)
    )
    .where(
      and(
        inArray(pomodoroAchievements.userId, followed),
        // A badge an admin took away is not news (admin task 06).
        isNull(pomodoroAchievements.revokedAt),
        // Their own switches decide, not the fact that you follow them.
        eq(pomodoroProfiles.profilePublic, true),
        eq(pomodoroProfiles.showBadges, true),
        isNull(pomodoroProfiles.hiddenAt)
      )
    )
    .orderBy(desc(pomodoroAchievements.earnedAt))
    .limit(FEED_LIMIT)

  const feed: FollowingEventRow[] = []
  for (const row of rows) {
    const badge = findAchievement(row.badgeId)
    if (!badge) continue
    feed.push({
      name: row.name?.trim() || row.handle || "Someone",
      handle: row.handle,
      kind: "badge",
      label: badge.name,
      earnedOn: row.earnedAt.toISOString(),
    })
  }
  writeFeed(viewerUserId, feed, now)
  return feed
}

function writeFeed(viewerUserId: string, rows: FollowingEventRow[], now: number) {
  if (feedCache.size >= FEED_CACHE_LIMIT) {
    // Oldest insertion first, which is what a Map iterates.
    const oldest = feedCache.keys().next()
    if (!oldest.done) feedCache.delete(oldest.value)
  }
  feedCache.set(viewerUserId, { rows, expiresAt: now + FEED_CACHE_MS })
}

/** Drops a viewer's held feed, so a new follow shows on the next load. */
export function forgetFollowingFeed(viewerUserId: string) {
  feedCache.delete(viewerUserId)
}

/**
 * Sends a canned cheer to somebody the sender follows.
 *
 * Four things can stop it, and only one of them is visible to the sender.
 * Being blocked, and the recipient having cheers switched off, both report
 * success and deliver nothing: a sender who could tell the difference would
 * have a way to detect a block. Only the daily cap says so out loud, because
 * it is the sender's own doing and they can act on it.
 */
export async function sendCheer({
  fromUserId,
  handle,
  cheerId,
}: {
  fromUserId: string
  handle: string
  cheerId: string
}) {
  if (!findCheer(cheerId)) throw new Error("UNKNOWN_CHEER")
  const toUserId = await followableUser(handle)
  if (!toUserId) throw new Error("PROFILE_NOT_FOUND")
  if (toUserId === fromUserId) throw new Error("CANNOT_CHEER_SELF")

  const following = await isFollowing(fromUserId, handle)
  if (!following) throw new Error("NOT_FOLLOWING")

  // The cap is counted before anything is written, and it is the one refusal
  // the sender is told about.
  const dayAgo = new Date(Date.now() - 24 * 60 * 60_000)
  const [{ value: sentToday }] = await db
    .select({ value: count() })
    .from(pomodoroCheers)
    .where(
      and(
        eq(pomodoroCheers.fromUserId, fromUserId),
        eq(pomodoroCheers.toUserId, toUserId),
        gte(pomodoroCheers.createdAt, dayAgo)
      )
    )
  if (sentToday >= CHEERS_PER_DAY) throw new Error("CHEER_CAP_REACHED")

  const [recipient] = await db
    .select({ cheersEnabled: pomodoroProfiles.cheersEnabled })
    .from(pomodoroProfiles)
    .where(eq(pomodoroProfiles.userId, toUserId))
    .limit(1)

  const blocked = await isBlockedBetween(fromUserId, toUserId)
  const deliver = !blocked && Boolean(recipient?.cheersEnabled)

  const [sender] = await db
    .select({
      handle: pomodoroProfiles.handle,
      name: pomodoroProfiles.publicDisplayName,
    })
    .from(pomodoroProfiles)
    .where(eq(pomodoroProfiles.userId, fromUserId))
    .limit(1)
  const senderName = sender?.name?.trim() || sender?.handle || "Someone"

  // Both in one transaction, so a cheer never counts against the cap without
  // arriving. The row is written even when it is not delivered — a blocked
  // sender whose cap did not move could tell they had been blocked.
  await db.transaction(async (tx) => {
    await tx.insert(pomodoroCheers).values({ fromUserId, toUserId, cheerId })
    if (!deliver) return
    // The kind and the live nudge come with it. See
    // `workspace/docs/notifications.md` for the rules every notice follows.
    await writeNotices(tx, [
      {
        recipientUserId: toUserId,
        actorUserId: fromUserId,
        kind: "cheer",
        message: cheerNoticeMessage(senderName),
        detail: findCheer(cheerId)?.label ?? null,
      },
    ])
  })
  return { sent: true }
}

/** The most streak notices one person is sent in any seven days. */
export const STREAK_NOTICES_PER_WEEK = 5

/**
 * Somebody reached a streak milestone: tell the people who follow them, with
 * a link to their page so a cheer is one click away.
 *
 * Only what their own page publishes. A streak is under "Hours and streaks"
 * (`showFigures`), so with that switch off, or the page off or hidden, nobody
 * is told. A block in either direction drops that follower. And nobody gets
 * more than five of these a week, however many people they follow, so
 * following fifty busy people does not turn the bell into a feed.
 *
 * The caller decides that a milestone was just reached; this decides who
 * hears about it. Answers how many were told.
 */
export async function tellFollowersOfStreak(userId: string, days: number) {
  const [profile] = await db
    .select({
      handle: pomodoroProfiles.handle,
      publicDisplayName: pomodoroProfiles.publicDisplayName,
      profilePublic: pomodoroProfiles.profilePublic,
      hiddenAt: pomodoroProfiles.hiddenAt,
      showFigures: pomodoroProfiles.showFigures,
    })
    .from(pomodoroProfiles)
    .where(eq(pomodoroProfiles.userId, userId))
    .limit(1)
  if (
    !profile?.handle ||
    !profile.profilePublic ||
    profile.hiddenAt ||
    !profile.showFigures
  )
    return 0

  const recipients = await followersToTell(userId, "followed_streak", {
    cap: STREAK_NOTICES_PER_WEEK,
    withinMs: 7 * 24 * 60 * 60_000,
  })
  if (recipients.length === 0) return 0

  const message = followedStreakMessage(noticeName(profile), days)
  await db.transaction((tx) =>
    writeNotices(
      tx,
      recipients.map((recipientUserId) => ({
        recipientUserId,
        actorUserId: userId,
        kind: "followed_streak" as const,
        message,
        detail: "Send them a cheer from their page.",
      }))
    )
  )
  return recipients.length
}

/** Whether this person accepts cheers at all. */
export async function setCheersEnabled(userId: string, enabled: boolean) {
  await db
    .update(pomodoroProfiles)
    .set({ cheersEnabled: enabled, updatedAt: new Date() })
    .where(eq(pomodoroProfiles.userId, userId))
  return { cheersEnabled: enabled }
}

/**
 * The people the viewer follows, for the room-invite picker and the pact
 * partner picker. Name and handle only; no ids leave.
 */
export async function listFollowing(viewerUserId: string) {
  const followed = await followedUserIds(viewerUserId)
  if (!followed.length) return []
  return db
    .select({
      name: pomodoroProfiles.publicDisplayName,
      handle: pomodoroProfiles.handle,
    })
    .from(pomodoroProfiles)
    .where(
      and(
        inArray(pomodoroProfiles.userId, followed),
        eq(pomodoroProfiles.profilePublic, true),
        isNull(pomodoroProfiles.hiddenAt)
      )
    )
    .orderBy(sql`lower(coalesce(${pomodoroProfiles.publicDisplayName}, ${pomodoroProfiles.handle}))`)
}
