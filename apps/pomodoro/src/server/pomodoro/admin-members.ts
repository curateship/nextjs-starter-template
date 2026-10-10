import { and, count, desc, eq, inArray, isNull, or, sql } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"

import { db } from "@/server/db"
import { loadEntitlements } from "@/server/billing/entitlements"
import { listWarnings } from "@/server/pomodoro/safety"
import { writeNotices } from "@/server/pomodoro/notices"
import { loadFocusStreaks, localDateFor } from "@/server/pomodoro/productivity"
import {
  dailyFocusStats,
  focusSessions,
  pomodoroAdminNotes,
  pomodoroAuditLogs,
  pomodoroFollows,
  pomodoroMediaUploads,
  pomodoroProfiles,
  pomodoroStreakFixes,
  pomodoroSuspensions,
  roomMemberships,
  roomMessages,
  roomReports,
  rooms,
  tasks,
  userPreferences,
} from "@/server/pomodoro/schema"
import { customShellMedia, customShellUsers as users } from "@/server/schema"
import { forgetFollowingFeed } from "@/server/pomodoro/following"
import { forgetFollowedPages } from "@/server/pomodoro/admin-follows"
import { PROFILE_HIDDEN_MESSAGE, streakRestoredMessage } from "@/lib/pomodoro/notices"
import { formatShortDay } from "@/lib/format/calendar-day"


/** An upload's kept original, joined to count its space. */
const keptOriginal = alias(customShellMedia, "kept_original")
/**
 * The member window (admin task 06): everything about one person in one read,
 * and the things an admin can do from it. Fixing a streak day, the private
 * notes, hiding a profile and removing someone's follows live here; Warn and
 * Suspend are `safety.ts`. See `workspace/docs/admin-members.md`.
 *
 * Every change writes one `pomodoro_audit_logs` row in its own transaction.
 */

/** How many rows each short section of the window shows. */
const SECTION_ROWS = 10

/** Everything the window shows, read fresh every time it opens. */
export async function loadMemberWindow(userId: string) {
  const [person] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      avatarUrl: users.avatarUrl,
      createdAt: users.createdAt,
      handle: pomodoroProfiles.handle,
      publicDisplayName: pomodoroProfiles.publicDisplayName,
      profilePublic: pomodoroProfiles.profilePublic,
      hiddenAt: pomodoroProfiles.hiddenAt,
      leaderboardOptIn: pomodoroProfiles.leaderboardOptIn,
      leaderboardHiddenAt: pomodoroProfiles.leaderboardHiddenAt,
      timezone: pomodoroProfiles.timezone,
      focusMinutes: userPreferences.focusMinutes,
    })
    .from(users)
    .leftJoin(pomodoroProfiles, eq(pomodoroProfiles.userId, users.id))
    .leftJoin(userPreferences, eq(userPreferences.userId, users.id))
    .where(eq(users.id, userId))
    .limit(1)
  if (!person) throw new Error("MEMBER_NOT_FOUND")

  const today = localDateFor(person.timezone ?? "UTC")
  const now = new Date()
  const [
    entitlements,
    [totals],
    streak,
    fixes,
    recentSessions,
    openTasks,
    hosted,
    joined,
    reports,
    uploads,
    warnings,
    suspensions,
    notes,
    following,
  ] = await Promise.all([
    loadEntitlements(userId),
    db
      .select({
        focusSessions: sql<number>`coalesce(sum(${dailyFocusStats.focusSessions}), 0)::int`,
        focusSeconds: sql<number>`coalesce(sum(${dailyFocusStats.focusSeconds}), 0)::int`,
        tasksCompleted: sql<number>`coalesce(sum(${dailyFocusStats.tasksCompleted}), 0)::int`,
        lastFocusedOn: sql<string | null>`max(${dailyFocusStats.localDate}) filter (where ${dailyFocusStats.focusSessions} > 0)`,
      })
      .from(dailyFocusStats)
      .where(eq(dailyFocusStats.userId, userId)),
    loadFocusStreaks(userId, today),
    db
      .select({
        id: pomodoroStreakFixes.id,
        localDate: pomodoroStreakFixes.localDate,
        reason: pomodoroStreakFixes.reason,
        createdAt: pomodoroStreakFixes.createdAt,
      })
      .from(pomodoroStreakFixes)
      .where(eq(pomodoroStreakFixes.userId, userId))
      .orderBy(desc(pomodoroStreakFixes.localDate))
      .limit(SECTION_ROWS),
    db
      .select({
        id: focusSessions.id,
        mode: focusSessions.mode,
        status: focusSessions.status,
        accumulatedSeconds: focusSessions.accumulatedSeconds,
        createdAt: focusSessions.createdAt,
        roomName: rooms.name,
      })
      .from(focusSessions)
      .leftJoin(rooms, eq(rooms.id, focusSessions.roomId))
      .where(eq(focusSessions.userId, userId))
      .orderBy(desc(focusSessions.createdAt))
      .limit(SECTION_ROWS),
    listOpenTasks(userId),
    listRooms(userId, "hosted"),
    listRooms(userId, "joined"),
    countReports(userId),
    listUploads(userId),
    listWarnings(userId),
    db
      .select({
        id: pomodoroSuspensions.id,
        reason: pomodoroSuspensions.reason,
        endsAt: pomodoroSuspensions.endsAt,
        createdAt: pomodoroSuspensions.createdAt,
        liftedAt: pomodoroSuspensions.liftedAt,
      })
      .from(pomodoroSuspensions)
      .where(eq(pomodoroSuspensions.userId, userId))
      .orderBy(desc(pomodoroSuspensions.createdAt))
      .limit(SECTION_ROWS),
    listMemberNotes(userId),
    db
      .select({ total: count() })
      .from(pomodoroFollows)
      .where(eq(pomodoroFollows.followerUserId, userId)),
  ])

  return {
    person: {
      id: person.id,
      name: person.name,
      email: person.email,
      role: person.role,
      avatarUrl: person.avatarUrl,
      joinedAt: person.createdAt,
      handle: person.handle,
      publicDisplayName: person.publicDisplayName,
      profilePublic: person.profilePublic ?? false,
      profileHidden: Boolean(person.hiddenAt),
      leaderboardOptIn: person.leaderboardOptIn ?? false,
      leaderboardHidden: Boolean(person.leaderboardHiddenAt),
      timezone: person.timezone ?? "UTC",
      planName: entitlements.entitlements.planName,
      isPaid: entitlements.entitlements.isPaid,
    },
    today,
    /** One focus session's minutes, what a fixed day is worth on the page. */
    focusMinutes: person.focusMinutes ?? 25,
    totals: {
      focusSessions: totals?.focusSessions ?? 0,
      focusSeconds: totals?.focusSeconds ?? 0,
      tasksCompleted: totals?.tasksCompleted ?? 0,
      lastFocusedOn: totals?.lastFocusedOn ?? null,
      currentStreak: streak.currentStreak,
      bestStreak: streak.bestStreak,
    },
    fixes,
    recentSessions,
    openTasks,
    hosted,
    joined,
    reports,
    uploads,
    warnings,
    suspensions: suspensions.map((row) => ({
      ...row,
      running: !row.liftedAt && (!row.endsAt || row.endsAt > now),
    })),
    notes,
    followingCount: following[0]?.total ?? 0,
  }
}

export type MemberWindow = Awaited<ReturnType<typeof loadMemberWindow>>

async function listOpenTasks(userId: string) {
  const open = and(eq(tasks.userId, userId), eq(tasks.status, "active"))
  const [rows, [total]] = await Promise.all([
    db
      .select({ id: tasks.id, title: tasks.title, plannedDate: tasks.plannedDate })
      .from(tasks)
      .where(open)
      .orderBy(desc(tasks.plannedDate), desc(tasks.createdAt))
      .limit(SECTION_ROWS),
    db.select({ total: count() }).from(tasks).where(open),
  ])
  return { rows, total: total?.total ?? 0 }
}

async function listRooms(userId: string, which: "hosted" | "joined") {
  if (which === "hosted") {
    const where = eq(rooms.hostUserId, userId)
    const [rows, [total]] = await Promise.all([
      db
        .select({ id: rooms.id, name: rooms.name, phase: rooms.phase, at: rooms.createdAt })
        .from(rooms)
        .where(where)
        .orderBy(desc(rooms.createdAt))
        .limit(SECTION_ROWS),
      db.select({ total: count() }).from(rooms).where(where),
    ])
    return { rows, total: total?.total ?? 0 }
  }
  // Rooms somebody else hosted that this person sat in, once each.
  const where = and(
    eq(roomMemberships.userId, userId),
    sql`${rooms.hostUserId} <> ${userId}`
  )
  const [rows, [total]] = await Promise.all([
    db
      .select({
        id: rooms.id,
        name: rooms.name,
        phase: rooms.phase,
        at: sql<Date>`max(${roomMemberships.joinedAt})`,
      })
      .from(roomMemberships)
      .innerJoin(rooms, eq(rooms.id, roomMemberships.roomId))
      .where(where)
      .groupBy(rooms.id, rooms.name, rooms.phase)
      .orderBy(desc(sql`max(${roomMemberships.joinedAt})`))
      .limit(SECTION_ROWS),
    db
      .select({ total: sql<number>`count(distinct ${roomMemberships.roomId})::int` })
      .from(roomMemberships)
      .innerJoin(rooms, eq(rooms.id, roomMemberships.roomId))
      .where(where),
  ])
  return { rows, total: total?.total ?? 0 }
}

/**
 * Reports this person filed, and reports about them: about a message they
 * wrote or about their profile. The same two counts the report row shows.
 */
async function countReports(userId: string) {
  const [[by], [about]] = await Promise.all([
    db
      .select({
        total: count(),
        dismissed: sql<number>`count(*) filter (where ${roomReports.status} = 'dismissed')::int`,
      })
      .from(roomReports)
      .where(eq(roomReports.reporterUserId, userId)),
    db
      .select({
        total: count(),
        waiting: sql<number>`count(*) filter (where ${roomReports.status} = 'pending')::int`,
      })
      .from(roomReports)
      .leftJoin(roomMessages, eq(roomMessages.id, roomReports.messageId))
      .where(or(eq(roomReports.profileUserId, userId), eq(roomMessages.userId, userId))),
  ])
  return {
    by: by?.total ?? 0,
    byDismissed: by?.dismissed ?? 0,
    about: about?.total ?? 0,
    aboutWaiting: about?.waiting ?? 0,
  }
}

async function listUploads(userId: string) {
  const [rows, [total]] = await Promise.all([
    db
      .select({
        mediaId: pomodoroMediaUploads.mediaId,
        purpose: pomodoroMediaUploads.purpose,
        status: pomodoroMediaUploads.status,
        // The name the member typed; an older row has only the file name.
        name: sql<string>`coalesce(${pomodoroMediaUploads.name}, ${customShellMedia.originalName})`,
        bytes: customShellMedia.fileSize,
        createdAt: pomodoroMediaUploads.createdAt,
      })
      .from(pomodoroMediaUploads)
      .innerJoin(customShellMedia, eq(customShellMedia.id, pomodoroMediaUploads.mediaId))
      .where(eq(pomodoroMediaUploads.userId, userId))
      .orderBy(desc(pomodoroMediaUploads.createdAt))
      .limit(SECTION_ROWS),
    db
      .select({
        total: count(),
        // A sound or clip's kept original takes space too.
        bytes: sql<number>`coalesce(sum(${customShellMedia.fileSize} + coalesce(${keptOriginal.fileSize}, 0)), 0)::bigint`,
      })
      .from(pomodoroMediaUploads)
      .innerJoin(customShellMedia, eq(customShellMedia.id, pomodoroMediaUploads.mediaId))
      .leftJoin(keptOriginal, eq(keptOriginal.id, pomodoroMediaUploads.sourceMediaId))
      .where(eq(pomodoroMediaUploads.userId, userId)),
  ])
  return { rows, total: total?.total ?? 0, bytes: Number(total?.bytes ?? 0) }
}

// ---------------------------------------------------------------------------
// Fix a streak day
// ---------------------------------------------------------------------------

/**
 * Puts one day back into a member's streak, with the admin's reason.
 *
 * The day goes into `pomodoro_streak_fixes`, which only the streak count
 * reads. `daily_focus_stats` is not touched, so the leaderboard, the badges
 * and History's hours cannot move. A day in the future, or one the member
 * already focused on or already had fixed, is refused with a reason.
 */
export async function addStreakFix({
  userId,
  localDate,
  reason,
  actorUserId,
}: {
  userId: string
  localDate: string
  reason: string
  actorUserId: string
}) {
  const [profile] = await db
    .select({ timezone: pomodoroProfiles.timezone })
    .from(users)
    .leftJoin(pomodoroProfiles, eq(pomodoroProfiles.userId, users.id))
    .where(eq(users.id, userId))
    .limit(1)
  if (!profile) throw new Error("MEMBER_NOT_FOUND")
  if (localDate > localDateFor(profile.timezone ?? "UTC")) throw new Error("FIX_IN_FUTURE")

  return db.transaction(async (tx) => {
    const [focused] = await tx
      .select({ id: dailyFocusStats.id })
      .from(dailyFocusStats)
      .where(
        and(
          eq(dailyFocusStats.userId, userId),
          eq(dailyFocusStats.localDate, localDate),
          sql`${dailyFocusStats.focusSessions} > 0`
        )
      )
      .limit(1)
    if (focused) throw new Error("FIX_DAY_FOCUSED")
    const [fix] = await tx
      .insert(pomodoroStreakFixes)
      .values({ userId, localDate, reason, createdByUserId: actorUserId })
      .onConflictDoNothing()
      .returning({ id: pomodoroStreakFixes.id })
    if (!fix) throw new Error("FIX_DAY_ALREADY_FIXED")
    await tx.insert(pomodoroAuditLogs).values({
      actorUserId,
      action: "fix_streak_day",
      resource: "members",
      recordIds: [fix.id],
    })
    await writeNotices(tx, [
      {
        recipientUserId: userId,
        kind: "streak_restored",
        message: streakRestoredMessage(formatShortDay(localDate)),
        href: "/history",
      },
    ])
    return { id: fix.id }
  })
}

// ---------------------------------------------------------------------------
// Private admin notes
// ---------------------------------------------------------------------------

export async function listMemberNotes(userId: string) {
  const writer = sql<string | null>`(select ${users.name} from ${users} where ${users.id} = ${pomodoroAdminNotes.createdByUserId})`
  const editor = sql<string | null>`(select ${users.name} from ${users} where ${users.id} = ${pomodoroAdminNotes.updatedByUserId})`
  return db
    .select({
      id: pomodoroAdminNotes.id,
      body: pomodoroAdminNotes.body,
      createdAt: pomodoroAdminNotes.createdAt,
      writtenBy: writer,
      updatedAt: pomodoroAdminNotes.updatedAt,
      updatedBy: editor,
    })
    .from(pomodoroAdminNotes)
    .where(eq(pomodoroAdminNotes.userId, userId))
    .orderBy(desc(pomodoroAdminNotes.createdAt))
}

export async function addMemberNote({
  userId,
  body,
  actorUserId,
}: {
  userId: string
  body: string
  actorUserId: string
}) {
  const [person] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1)
  if (!person) throw new Error("MEMBER_NOT_FOUND")
  return db.transaction(async (tx) => {
    const [note] = await tx
      .insert(pomodoroAdminNotes)
      .values({ userId, body, createdByUserId: actorUserId })
      .returning({ id: pomodoroAdminNotes.id })
    await tx.insert(pomodoroAuditLogs).values({ actorUserId, action: "add_note", resource: "member_notes", recordIds: [note.id] })
    return note
  })
}

export async function editMemberNote({
  noteId,
  body,
  actorUserId,
}: {
  noteId: string
  body: string
  actorUserId: string
}) {
  return db.transaction(async (tx) => {
    const changed = await tx
      .update(pomodoroAdminNotes)
      .set({ body, updatedByUserId: actorUserId, updatedAt: new Date() })
      .where(eq(pomodoroAdminNotes.id, noteId))
      .returning({ id: pomodoroAdminNotes.id })
    if (!changed.length) throw new Error("NOTE_NOT_FOUND")
    await tx.insert(pomodoroAuditLogs).values({ actorUserId, action: "edit_note", resource: "member_notes", recordIds: [noteId] })
  })
}

export async function deleteMemberNote({ noteId, actorUserId }: { noteId: string; actorUserId: string }) {
  return db.transaction(async (tx) => {
    const removed = await tx
      .delete(pomodoroAdminNotes)
      .where(eq(pomodoroAdminNotes.id, noteId))
      .returning({ id: pomodoroAdminNotes.id })
    if (!removed.length) throw new Error("NOTE_NOT_FOUND")
    await tx.insert(pomodoroAuditLogs).values({ actorUserId, action: "delete_note", resource: "member_notes", recordIds: [noteId] })
  })
}

// ---------------------------------------------------------------------------
// Hide a profile, remove someone's follows
// ---------------------------------------------------------------------------

/**
 * Hides members' public profiles without a report to hang it on, from the
 * member window and the Public profiles page. The owner is told in the bell,
 * in the same words a hide from a report uses. Showing one again is Lift on
 * the Bans page (`showHiddenProfiles`), which tells them too.
 */
export async function hideProfilesByAdmin({
  userIds,
  actorUserId,
}: {
  userIds: string[]
  actorUserId: string
}) {
  return db.transaction(async (tx) => {
    const hidden = await tx
      .update(pomodoroProfiles)
      .set({ hiddenAt: new Date(), updatedAt: new Date() })
      .where(and(inArray(pomodoroProfiles.userId, userIds), isNull(pomodoroProfiles.hiddenAt)))
      .returning({ userId: pomodoroProfiles.userId, handle: pomodoroProfiles.handle })
    const ids = hidden.map((row) => row.userId)
    if (ids.length) {
      await tx.insert(pomodoroAuditLogs).values({ actorUserId, action: "hide", resource: "pomodoro_profile", recordIds: ids })
      await writeNotices(
        tx,
        ids.map((userId) => ({
          recipientUserId: userId,
          kind: "profile_hidden" as const,
          message: PROFILE_HIDDEN_MESSAGE,
          href: "/settings?tab=public",
        }))
      )
    }
    return {
      changed: ids,
      skipped: userIds.filter((id) => !ids.includes(id)),
      handles: hidden.map((row) => row.handle),
    }
  })
}

/**
 * Removes every follow this person made, for an account that followed people
 * to spam them. The people they followed are not told, the same as an
 * unfollow.
 */
export async function removeAllFollowsBy({ userId, actorUserId }: { userId: string; actorUserId: string }) {
  const removed = await db.transaction(async (tx) => {
    const rows = await tx
      .delete(pomodoroFollows)
      .where(eq(pomodoroFollows.followerUserId, userId))
      .returning({ id: pomodoroFollows.id, followedUserId: pomodoroFollows.followedUserId })
    if (rows.length)
      await tx.insert(pomodoroAuditLogs).values({
        actorUserId,
        action: "delete",
        resource: "follows",
        recordIds: rows.map((row) => row.id),
      })
    return rows
  })
  forgetFollowingFeed(userId)
  await forgetFollowedPages(removed.map((row) => row.followedUserId))
  return { removed: removed.length }
}
