import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/server/auth/origin", () => ({ requestIp: () => "203.0.113.7" }))

import { type CustomShellDb } from "@/server/db"
import {
  addMemberNote,
  addStreakFix,
  deleteMemberNote,
  editMemberNote,
  hideProfilesByAdmin,
  loadMemberWindow,
  removeAllFollowsBy,
} from "@/server/pomodoro/admin-members"
import { loadBestStreak } from "@/server/pomodoro/achievements"
import { readLeaderboardRows } from "@/server/pomodoro/leaderboard"
import { loadFocusSummary, localDateFor } from "@/server/pomodoro/productivity"
import {
  dailyFocusStats,
  focusSessions,
  pomodoroAuditLogs,
  pomodoroFollows,
  pomodoroNoticeLinks,
  pomodoroProfiles,
  pomodoroStreakFixes,
} from "@/server/pomodoro/schema"
import { customShellNotifications } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"
import { shiftLocalDate } from "@/lib/pomodoro/focus-history"

/**
 * The member window's server side (admin task 06), against a real database:
 * the figures it reads, and what fixing a streak day, the notes, hiding a
 * profile and removing follows each change and log.
 */

let client: PGlite
let db: CustomShellDb
const today = localDateFor("UTC")
const daysAgo = (days: number) => shiftLocalDate(today, -days)

beforeEach(async () => {
  ;({ client, db } = await createTestDatabase())
})

afterEach(async () => {
  await client.close()
})

async function person(name: string, role = "member") {
  const user = await insertUser(db, { name, role })
  await db.insert(pomodoroProfiles).values({
    userId: user.id,
    publicDisplayName: name,
    handle: name.toLowerCase(),
    profilePublic: true,
    leaderboardOptIn: true,
    timezone: "UTC",
  })
  return user.id
}

/** A day with one finished 25-minute focus. */
async function focusedOn(userId: string, localDate: string) {
  await db.insert(dailyFocusStats).values({ userId, localDate, focusSessions: 1, focusSeconds: 1500 })
}

async function logRows(action: string) {
  return db.select().from(pomodoroAuditLogs).where(eq(pomodoroAuditLogs.action, action))
}

describe("fixing a streak day", () => {
  it("joins the streak back up and moves nothing else", async () => {
    const admin = await person("Admin", "admin")
    const member = await person("Mia")
    // Focused for the last five days, except the one three days ago: an outage.
    for (const ago of [0, 1, 2, 4, 5]) await focusedOn(member, daysAgo(ago))

    const before = await loadFocusSummary(member, today, 4)
    expect(before.currentStreak).toBe(3)
    const boardBefore = await readLeaderboardRows({ start: daysAgo(30), viewerUserId: admin })
    const bestBadgeStreakBefore = await loadBestStreak(member, today)

    await addStreakFix({ userId: member, localDate: daysAgo(3), reason: "Outage", actorUserId: admin })

    const after = await loadFocusSummary(member, today, 4)
    expect(after.currentStreak).toBe(6)
    expect(after.bestStreak).toBe(6)
    // The badges are checked against real days only.
    expect(after.earnedBestStreak).toBe(3)
    expect(await loadBestStreak(member, today)).toBe(bestBadgeStreakBefore)
    // The leaderboard and the hours read daily_focus_stats, which is untouched.
    expect(await readLeaderboardRows({ start: daysAgo(30), viewerUserId: admin })).toEqual(boardBefore)
    const window = await loadMemberWindow(member)
    expect(window.totals).toMatchObject({ focusSessions: 5, focusSeconds: 7500, currentStreak: 6 })
    expect(window.fixes).toHaveLength(1)
  })

  it("tells the member, names the day, and logs the reason's row", async () => {
    const admin = await person("Admin", "admin")
    const member = await person("Mia")
    await addStreakFix({ userId: member, localDate: "2026-10-03", reason: "Outage, 3 Oct", actorUserId: admin })

    const notices = await db
      .select({ message: customShellNotifications.message, kind: pomodoroNoticeLinks.kind })
      .from(customShellNotifications)
      .innerJoin(pomodoroNoticeLinks, eq(pomodoroNoticeLinks.noticeId, customShellNotifications.id))
      .where(eq(customShellNotifications.recipientUserId, member))
    expect(notices).toEqual([{ message: "We restored Oct 3 to your streak.", kind: "streak_restored" }])
    const [fix] = await db.select().from(pomodoroStreakFixes)
    expect(fix).toMatchObject({ reason: "Outage, 3 Oct", createdByUserId: admin })
    expect((await logRows("fix_streak_day"))[0].recordIds).toEqual([fix.id])
  })

  it("refuses a day they focused, a day already fixed, and a day still to come", async () => {
    const admin = await person("Admin", "admin")
    const member = await person("Mia")
    await focusedOn(member, daysAgo(1))
    await expect(addStreakFix({ userId: member, localDate: daysAgo(1), reason: "x", actorUserId: admin })).rejects.toThrow(
      "FIX_DAY_FOCUSED"
    )
    await addStreakFix({ userId: member, localDate: daysAgo(2), reason: "x", actorUserId: admin })
    await expect(addStreakFix({ userId: member, localDate: daysAgo(2), reason: "x", actorUserId: admin })).rejects.toThrow(
      "FIX_DAY_ALREADY_FIXED"
    )
    await expect(
      addStreakFix({ userId: member, localDate: shiftLocalDate(today, 2), reason: "x", actorUserId: admin })
    ).rejects.toThrow("FIX_IN_FUTURE")
    expect(await logRows("fix_streak_day")).toHaveLength(1)
  })
})

describe("the window's figures", () => {
  it("match the lists they link to", async () => {
    const member = await person("Mia")
    await focusedOn(member, daysAgo(1))
    await db.insert(focusSessions).values(
      Array.from({ length: 12 }, (_, index) => ({
        userId: member,
        mode: "focus",
        status: "completed",
        plannedSeconds: 1500,
        accumulatedSeconds: 1500,
        idempotencyKey: `run-${index}`,
        createdAt: new Date(Date.UTC(2026, 9, 1, index)),
      }))
    )
    const window = await loadMemberWindow(member)
    // The last ten runs, newest first, as the Focus sessions list orders them.
    expect(window.recentSessions).toHaveLength(10)
    expect(window.recentSessions[0].createdAt.getTime()).toBe(Date.UTC(2026, 9, 1, 11))
    expect(window.totals.lastFocusedOn).toBe(daysAgo(1))
    expect(window.person).toMatchObject({ handle: "mia", profileHidden: false, leaderboardHidden: false })
  })

  it("refuses an account that is not there", async () => {
    await expect(loadMemberWindow("nobody")).rejects.toThrow("MEMBER_NOT_FOUND")
  })
})

describe("admin notes", () => {
  it("adds, edits and deletes, stamping who and logging each change", async () => {
    const admin = await person("Admin", "admin")
    const other = await person("Other", "admin")
    const member = await person("Mia")
    const note = await addMemberNote({ userId: member, body: "Wrote in about a refund.", actorUserId: admin })
    await editMemberNote({ noteId: note.id, body: "Refund sent.", actorUserId: other })

    const [read] = (await loadMemberWindow(member)).notes
    expect(read).toMatchObject({ body: "Refund sent.", writtenBy: "Admin", updatedBy: "Other" })

    await deleteMemberNote({ noteId: note.id, actorUserId: admin })
    expect((await loadMemberWindow(member)).notes).toEqual([])
    expect((await logRows("add_note")).length + (await logRows("edit_note")).length + (await logRows("delete_note")).length).toBe(3)
    await expect(deleteMemberNote({ noteId: note.id, actorUserId: admin })).rejects.toThrow("NOTE_NOT_FOUND")
  })
})

describe("hiding a profile and removing follows", () => {
  it("hides once, tells the owner once, and skips a profile already hidden", async () => {
    const admin = await person("Admin", "admin")
    const member = await person("Mia")
    expect(await hideProfilesByAdmin({ userIds: [member], actorUserId: admin })).toMatchObject({ changed: [member] })
    expect(await hideProfilesByAdmin({ userIds: [member], actorUserId: admin })).toMatchObject({
      changed: [],
      skipped: [member],
    })
    const kinds = await db.select({ kind: pomodoroNoticeLinks.kind }).from(pomodoroNoticeLinks)
    expect(kinds).toEqual([{ kind: "profile_hidden" }])
    expect(await logRows("hide")).toHaveLength(1)
  })

  it("removes every follow the person made and none made of them", async () => {
    const admin = await person("Admin", "admin")
    const spammer = await person("Spam")
    const first = await person("First")
    const second = await person("Second")
    await db.insert(pomodoroFollows).values([
      { followerUserId: spammer, followedUserId: first },
      { followerUserId: spammer, followedUserId: second },
      { followerUserId: first, followedUserId: spammer },
    ])
    expect(await removeAllFollowsBy({ userId: spammer, actorUserId: admin })).toEqual({ removed: 2 })
    const left = await db.select().from(pomodoroFollows)
    expect(left).toHaveLength(1)
    expect(left[0].followerUserId).toBe(first)
    expect(await removeAllFollowsBy({ userId: spammer, actorUserId: admin })).toEqual({ removed: 0 })
    expect(await logRows("delete")).toHaveLength(1)
  })
})
