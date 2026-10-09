import { PGlite } from "@electric-sql/pglite"
import { and, count, eq, inArray, sql } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { isHandleShape, RESERVED_HANDLES } from "@/lib/pomodoro/public-profile"
import {
  planSimulatedDay,
  shiftDate,
  type SimulatedHabits,
} from "@/lib/pomodoro/simulated-days"
import { type CustomShellDb } from "@/server/db"
import { saveAppSetting } from "@/server/pomodoro/app-settings"
import { localDateFor } from "@/server/pomodoro/productivity"
import { forgetUsersPages, readUsersPage } from "@/server/pomodoro/public-profile"
import {
  dailyFocusStats,
  focusSessions,
  pomodoroAchievements,
  pomodoroAuditLogs,
  pomodoroProfiles,
  pomodoroProjects,
  pomodoroSimulatedAccounts,
  tasks,
} from "@/server/pomodoro/schema"
import {
  HISTORY_MAX_DAYS,
  HISTORY_MIN_DAYS,
  SIMULATED_EMAIL_DOMAIN,
  makeDueAccounts,
  makeSimulatedAccount,
  removeAllSimulated,
  requestMakeNow,
  runSimulatedDays,
} from "@/server/pomodoro/simulated-accounts"
import {
  customShellAuthTokens,
  customShellSystemEmailSends,
  customShellUsers,
} from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

/**
 * The made-up members against a real database: making them, their history,
 * one working day, two worker passes at once, and Remove all leaving every
 * real account alone.
 */

let client: PGlite
let db: CustomShellDb
let adminId: string

beforeEach(async () => {
  ;({ client, db } = await createTestDatabase())
  adminId = (await insertUser(db, { role: "admin" })).id
})

afterEach(async () => {
  await client.close()
})

async function setDial(target: number, hoursCap = 3, paused = false) {
  await saveAppSetting({
    key: "simulated.accounts",
    value: { target, hoursCap, paused },
    actorUserId: adminId,
  })
}

/** One account made straight away, outside the worker. */
async function makeOne(historyDays: number, now = new Date()) {
  return db.transaction((tx) =>
    makeSimulatedAccount(tx, { historyDays, hoursCap: 3, themes: [], now })
  )
}

async function simulatedIds() {
  const rows = await db
    .select({ userId: pomodoroSimulatedAccounts.userId })
    .from(pomodoroSimulatedAccounts)
  return rows.map((row) => row.userId)
}

describe("Make them now", () => {
  it("makes the dial's number of accounts that cannot sign in and are never emailed", async () => {
    await setDial(10)
    expect(await makeDueAccounts()).toBe(0) // nothing before the first press
    expect((await requestMakeNow(adminId)).queued).toBe(true)
    expect(await makeDueAccounts()).toBe(10)
    expect(await makeDueAccounts()).toBe(0)

    const ids = await simulatedIds()
    expect(ids).toHaveLength(10)
    const people = await db
      .select({
        user: customShellUsers,
        profile: pomodoroProfiles,
      })
      .from(customShellUsers)
      .innerJoin(pomodoroProfiles, eq(pomodoroProfiles.userId, customShellUsers.id))
      .where(inArray(customShellUsers.id, ids))
    expect(people).toHaveLength(10)
    for (const { user, profile } of people) {
      expect(user.passwordHash).toBeNull()
      expect(user.emailVerifiedAt).not.toBeNull()
      expect(user.email).toBe(`${profile.handle}@${SIMULATED_EMAIL_DOMAIN}`)
      expect(isHandleShape(profile.handle ?? "")).toBe(true)
      expect(RESERVED_HANDLES.has(profile.handle ?? "")).toBe(false)
      expect(profile.bio?.length).toBeLessThan(280)
      expect(profile).toMatchObject({
        profilePublic: true,
        listed: true,
        leaderboardOptIn: true,
        showFigures: true,
        showBadges: true,
        showHeatmap: true,
        showProjects: true,
        showFocusingNow: true,
        showRoom: true,
        shareTaskInRooms: true,
        cheersEnabled: true,
      })
    }
    expect(new Set(people.map(({ user }) => user.name)).size).toBe(10)

    // No password link was made and nothing was sent.
    const [tokens] = await db
      .select({ total: count() })
      .from(customShellAuthTokens)
      .where(inArray(customShellAuthTokens.userId, ids))
    expect(tokens.total).toBe(0)
    const [sends] = await db
      .select({ total: count() })
      .from(customShellSystemEmailSends)
      .where(sql`${customShellSystemEmailSends.toEmail} like ${`%@${SIMULATED_EMAIL_DOMAIN}`}`)
    expect(sends.total).toBe(0)

    // Two to three months behind each, never more: Tyler, 9 Oct 2026.
    const habits = await db.select({ habits: pomodoroSimulatedAccounts.habits }).from(pomodoroSimulatedAccounts)
    for (const { habits: habit } of habits) {
      expect(habit.historyDays).toBeGreaterThanOrEqual(HISTORY_MIN_DAYS)
      expect(habit.historyDays).toBeLessThanOrEqual(HISTORY_MAX_DAYS)
    }
    const [oldest] = await db
      .select({ day: sql<string>`min(${dailyFocusStats.localDate})` })
      .from(dailyFocusStats)
      .where(inArray(dailyFocusStats.userId, ids))
    const earliest = new Date(Date.now() - (HISTORY_MAX_DAYS + 2) * 86_400_000).toISOString().slice(0, 10)
    expect(oldest.day >= earliest).toBe(true)

    // They are on /users, which reads exactly what a real member's card does.
    const directory = await readUsersPage(0, null, { sort: "newest" })
    expect(directory.total).toBe(10)
    expect(directory.rows.every((row) => row.focusHours !== null)).toBe(true)

    const [made] = await db
      .select({ total: count() })
      .from(pomodoroAuditLogs)
      .where(eq(pomodoroAuditLogs.action, "simulated_make"))
    expect(made.total).toBe(1)
  }, 120_000)

  it("does nothing when the dial is already met", async () => {
    await setDial(0)
    expect((await requestMakeNow(adminId)).queued).toBe(false)
  })
})

describe("the history", () => {
  it("follows the day plan, leaves the days off empty and dates every badge inside it", async () => {
    const now = new Date()
    const { userId } = await makeOne(HISTORY_MAX_DAYS, now)
    const [{ habits }] = await db
      .select({ habits: pomodoroSimulatedAccounts.habits })
      .from(pomodoroSimulatedAccounts)
      .where(eq(pomodoroSimulatedAccounts.userId, userId))
    const today = localDateFor(habits.timezone, now)
    const expected = Array.from({ length: HISTORY_MAX_DAYS }, (_, index) =>
      planSimulatedDay(userId, habits, shiftDate(today, -(index + 1)), 3)
    ).filter((plan) => plan.sessions.length)

    const days = await db
      .select()
      .from(dailyFocusStats)
      .where(eq(dailyFocusStats.userId, userId))
    expect(days).toHaveLength(expected.length)
    expect(days.length).toBeLessThan(HISTORY_MAX_DAYS) // gaps in the year grid
    for (const day of days) {
      expect(day.localDate < today).toBe(true)
      expect(day.focusSeconds).toBeLessThanOrEqual(3 * 3_600)
    }

    const badges = await db
      .select()
      .from(pomodoroAchievements)
      .where(eq(pomodoroAchievements.userId, userId))
    expect(badges.length).toBeGreaterThan(0)
    const first = [...days].sort((a, b) => a.localDate.localeCompare(b.localDate))[0]
    for (const badge of badges) {
      expect(localDateFor(habits.timezone, badge.earnedAt) >= first.localDate).toBe(true)
      expect(localDateFor(habits.timezone, badge.earnedAt) < today).toBe(true)
    }

    // Pinned badges are earned ones; projects are three to five, two public.
    const [profile] = await db.select().from(pomodoroProfiles).where(eq(pomodoroProfiles.userId, userId))
    expect(profile.pinnedBadges.length).toBeGreaterThan(0)
    expect(profile.pinnedBadges.every((id) => badges.some((badge) => badge.badgeId === id))).toBe(true)
    const projects = await db.select().from(pomodoroProjects).where(eq(pomodoroProjects.userId, userId))
    expect(projects.length).toBeGreaterThanOrEqual(3)
    expect(projects.length).toBeLessThanOrEqual(5)
    expect(projects.filter((project) => project.isPublic)).toHaveLength(2)

    // The account joined before its history starts.
    const [user] = await db.select().from(customShellUsers).where(eq(customShellUsers.id, userId))
    expect(localDateFor(habits.timezone, user.createdAt) <= first.localDate).toBe(true)
  }, 60_000)
})

/** A working day in 2099 for this account, and its plan. */
async function workingDay(userId: string, habits: SimulatedHabits) {
  for (let index = 0; index < 60; index += 1) {
    const localDate = shiftDate("2099-03-02", index)
    const plan = planSimulatedDay(userId, habits, localDate, 3)
    if (plan.sessions.length >= 3) return plan
  }
  throw new Error("no working day found")
}

async function threeHourAccount() {
  const { userId } = await makeOne(0)
  const [{ habits }] = await db
    .select({ habits: pomodoroSimulatedAccounts.habits })
    .from(pomodoroSimulatedAccounts)
    .where(eq(pomodoroSimulatedAccounts.userId, userId))
  const steady = { ...habits, hoursADay: 3, daysOff: [] }
  await db
    .update(pomodoroSimulatedAccounts)
    .set({ habits: steady })
    .where(eq(pomodoroSimulatedAccounts.userId, userId))
  return { userId, habits: steady }
}

describe("one working day", () => {
  it("ends between 2.5 and 3.5 hours, in sessions of different lengths, with tasks ticked", async () => {
    await setDial(40, 3)
    const { userId, habits } = await threeHourAccount()
    const plan = await workingDay(userId, habits)

    // A pass a second after each session should start and as it ends, which
    // is what passes once a minute come to.
    for (const [index, session] of plan.sessions.entries()) {
      await runSimulatedDays(new Date(session.startsAt.getTime() + 1_000))
      if (index === 0) {
        // Mid-session they are "Online now" on /users, as a real member is.
        forgetUsersPages()
        expect((await readUsersPage(0, null, { sort: "online" })).total).toBe(1)
      }
      await runSimulatedDays(new Date(session.startsAt.getTime() + session.minutes * 60_000 + 1_000))
    }

    const [day] = await db
      .select()
      .from(dailyFocusStats)
      .where(and(eq(dailyFocusStats.userId, userId), eq(dailyFocusStats.localDate, plan.localDate)))
    expect(day.focusSessions).toBe(plan.sessions.length)
    expect(day.focusSeconds / 3_600).toBeGreaterThanOrEqual(2.5)
    expect(day.focusSeconds / 3_600).toBeLessThanOrEqual(3)

    const sessions = await db
      .select()
      .from(focusSessions)
      .where(eq(focusSessions.userId, userId))
    expect(sessions.every((session) => session.status === "completed")).toBe(true)
    expect(new Set(sessions.map((session) => session.accumulatedSeconds)).size).toBeGreaterThanOrEqual(3)

    const dayTasks = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.userId, userId), eq(tasks.plannedDate, plan.localDate)))
    expect(dayTasks).toHaveLength(plan.tasks.length)
    expect(dayTasks.filter((task) => task.status === "completed")).toHaveLength(
      plan.tasks.filter((task) => task.ticked).length
    )
    // Badges arrive the way a real member's do.
    const [badges] = await db
      .select({ total: count() })
      .from(pomodoroAchievements)
      .where(eq(pomodoroAchievements.userId, userId))
    expect(badges.total).toBeGreaterThan(0)
  }, 60_000)

  it("starts one session per account when two passes run at once", async () => {
    await setDial(40, 3)
    const accounts = [await threeHourAccount(), await threeHourAccount()]
    const plans = await Promise.all(accounts.map((account) => workingDay(account.userId, account.habits)))
    // The same instant for both: inside each account's first session.
    for (const [index, plan] of plans.entries()) {
      const at = new Date(plan.sessions[0].startsAt.getTime() + 1_000)
      const [first, second] = await Promise.all([runSimulatedDays(at), runSimulatedDays(at)])
      expect(first.started + second.started).toBeGreaterThanOrEqual(1)
      const running = await db
        .select()
        .from(focusSessions)
        .where(and(eq(focusSessions.userId, accounts[index].userId), eq(focusSessions.status, "running")))
      expect(running).toHaveLength(1)
    }
  }, 60_000)

  it("starts nothing while paused, and still finishes what is running", async () => {
    await setDial(40, 3)
    const { userId, habits } = await threeHourAccount()
    const plan = await workingDay(userId, habits)
    const [first] = plan.sessions
    await runSimulatedDays(new Date(first.startsAt.getTime() + 1_000))
    await setDial(40, 3, true)
    await runSimulatedDays(new Date(first.startsAt.getTime() + first.minutes * 60_000 + 1_000))
    const second = plan.sessions[1]
    await runSimulatedDays(new Date(second.startsAt.getTime() + 1_000))
    const sessions = await db.select().from(focusSessions).where(eq(focusSessions.userId, userId))
    expect(sessions.map((session) => session.status)).toEqual(["completed"])
  }, 60_000)
})

describe("new faces", () => {
  it("arrive within a week, one at a time, while the count is under the dial", async () => {
    const now = new Date()
    await makeOne(0, now)
    await makeOne(0, now)
    await setDial(3)
    expect(await makeDueAccounts(now)).toBe(0)
    expect(await makeDueAccounts(new Date(now.getTime() + 2 * 86_400_000))).toBe(0)
    expect(await makeDueAccounts(new Date(now.getTime() + 7 * 86_400_000))).toBe(1)
    expect(await simulatedIds()).toHaveLength(3)
    expect(await makeDueAccounts(new Date(now.getTime() + 30 * 86_400_000))).toBe(0)
  }, 60_000)

  it("never arrive by themselves on a database that has none", async () => {
    await setDial(40)
    expect(await makeDueAccounts(new Date(Date.now() + 30 * 86_400_000))).toBe(0)
  })
})

describe("Remove all", () => {
  it("takes every made-up account and everything they did, and no real account", async () => {
    const real = await insertUser(db)
    await db.insert(pomodoroProfiles).values({ userId: real.id, handle: "realperson" })
    await db.insert(dailyFocusStats).values({ userId: real.id, localDate: "2099-01-01", focusSessions: 1, focusSeconds: 1500 })
    await makeOne(HISTORY_MAX_DAYS)
    await makeOne(0)

    expect(await removeAllSimulated(adminId)).toEqual({ removed: 2 })
    expect(await simulatedIds()).toEqual([])
    const left = await db.select({ id: customShellUsers.id }).from(customShellUsers)
    expect(left.map((row) => row.id).sort()).toEqual([adminId, real.id].sort())
    const [sessions] = await db.select({ total: count() }).from(focusSessions)
    expect(sessions.total).toBe(0)
    const [realDays] = await db.select({ total: count() }).from(dailyFocusStats)
    expect(realDays.total).toBe(1)

    const [log] = await db
      .select()
      .from(pomodoroAuditLogs)
      .where(eq(pomodoroAuditLogs.action, "simulated_remove"))
    expect(log.recordIds).toHaveLength(2)
    expect(log.resource).toBe("simulated")
  }, 60_000)
})
