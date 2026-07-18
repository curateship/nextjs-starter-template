import { readFile } from "node:fs/promises"

import { PGlite } from "@electric-sql/pglite"
import { and, eq, isNull } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { getEntitlements } from "@/server/entitlements"
import { applyPomoderAdminAction, loadPomoderAdminData } from "@/server/admin"
import {
  adminCreateActionSchema,
  type PomoderAdminAction,
  type PomoderAdminCreateRecord,
} from "@/server/admin-contract"
import { loadFocusReport, loadFocusReportSessions, localDateStartInstant, REPORT_SESSION_PAGE_SIZE } from "@/server/focus-report"
import { generationLimit } from "@/server/generation"
import {
  finalizeProcessedUpload,
  validateMediaUpload,
  validateUploadContentLength,
} from "@/server/pomoder-media"
import { buildFocusSummary, calculateFocusStreaks, completeProductivitySession, loadFocusSummary, reorderTodayTasks, rollOverTasks, startProductivitySession, toggleTaskStatus, updateTaskPlan } from "@/server/productivity"
import { enforceRateLimit } from "@/server/rate-limit"
import {
  advanceExpiredRoom,
  applyHostRoomAction,
  banRoomMember,
  canJoinRoom,
  createRoomWithHost,
  deleteRoomMessage,
  joinRoomBySlug,
  leaveRoom,
  listPublicRooms,
  lookupRoomBySlug,
  removeRoomMember,
  reportRoomMessage,
  roomSnapshot,
  toggleRoomReaction,
} from "@/server/rooms"
import { consumeAuthToken } from "@/server/security"
import {
  applyBackgroundPreference,
  loadBackgroundPreference,
  resolveBackgroundReference,
} from "@/server/background-preferences"
import {
  applySoundPreferences,
  defaultSoundPreferences,
  loadSoundPreferences,
  resolveStorableSoundReference,
} from "@/server/sound-preferences"
import {
  createTimerPreset,
  deleteTimerPreset,
  listTimerPresets,
  updateTimerPreset,
} from "@/server/timer-presets"
import type { PomoderDb } from "@/server/db"
import {
  adminAuditLogs,
  authTokens,
  dailyFocusStats,
  focusSessions,
  generationUsage,
  mediaAssets,
  rateLimits,
  roomBans,
  roomMemberships,
  roomMessageReactions,
  roomMessages,
  roomReports,
  rooms,
  sessions,
  storageDeletionJobs,
  subscriptions,
  tasks,
  userPreferences,
  users,
} from "@/server/schema"
import { processStorageDeletionJobs } from "@/server/storage-deletion"
import * as schema from "@/server/schema"

let client: PGlite
let database: ReturnType<typeof drizzle<typeof schema>>

beforeEach(async () => {
  client = new PGlite()
  const migration = await readFile(
    new URL("../../drizzle/0000_custom_shell_baseline.sql", import.meta.url),
    "utf8"
  )
  await client.exec(migration)
  await client.exec(
    await readFile(
      new URL(
        "../../drizzle/0003_custom_shell_workspaces.sql",
        import.meta.url
      ),
      "utf8"
    )
  )
  await client.exec(
    await readFile(
      new URL("../../drizzle/0004_pomoder_product.sql", import.meta.url),
      "utf8"
    )
  )
  await client.exec(
    await readFile(
      new URL("../../drizzle/0005_admin_security.sql", import.meta.url),
      "utf8"
    )
  )
  await client.exec(
    await readFile(
      new URL("../../drizzle/0006_daily_goals_and_streaks.sql", import.meta.url),
      "utf8"
    )
  )
  await client.exec(
    await readFile(
      new URL("../../drizzle/0007_working_sound_player.sql", import.meta.url),
      "utf8"
    )
  )
  await client.exec(
    await readFile(
      new URL("../../drizzle/0008_advanced_task_planning.sql", import.meta.url),
      "utf8"
    )
  )
  await client.exec(
    await readFile(
      new URL("../../drizzle/0009_complete_room_controls.sql", import.meta.url),
      "utf8"
    )
  )
  await client.exec(
    await readFile(
      new URL("../../drizzle/0010_room_moderation_tools.sql", import.meta.url),
      "utf8"
    )
  )
  await client.exec(
    await readFile(
      new URL("../../drizzle/0011_focus_rhythm_presets.sql", import.meta.url),
      "utf8"
    )
  )
  await client.exec(
    await readFile(
      new URL("../../drizzle/0012_light_dark_mode.sql", import.meta.url),
      "utf8"
    )
  )
  await client.exec(
    await readFile(
      new URL("../../drizzle/0013_working_custom_backgrounds.sql", import.meta.url),
      "utf8"
    )
  )
  await client.exec(
    await readFile(
      new URL("../../drizzle/0014_room_chat_reactions.sql", import.meta.url),
      "utf8"
    )
  )
  database = drizzle(client, { schema })
})

afterEach(async () => client.close())

describe("Pomoder entitlements", () => {
  it("grants Pro only while an eligible subscription period is current", () => {
    const now = new Date("2026-07-14T12:00:00Z")
    expect(getEntitlements(null, now).plan).toBe("free")
    expect(
      getEntitlements(
        {
          status: "active",
          currentPeriodEnd: new Date("2026-08-14T12:00:00Z"),
        },
        now
      )
    ).toMatchObject({
      plan: "pro",
      canHostRooms: true,
      storageLimitBytes: 2_147_483_648,
      monthlyBackgrounds: 5,
      monthlySoundscapes: 20,
    })
    expect(
      getEntitlements(
        {
          status: "past_due",
          currentPeriodEnd: new Date("2026-07-15T12:00:00Z"),
        },
        now
      ).plan
    ).toBe("pro")
    expect(
      getEntitlements(
        {
          status: "canceled",
          currentPeriodEnd: new Date("2026-08-14T12:00:00Z"),
        },
        now
      ).plan
    ).toBe("free")
  })
})

describe("task rollover", () => {
  it("archives prior active tasks and clones them into today once", async () => {
    const [user] = await database
      .insert(users)
      .values({
        email: "focus@example.com",
        name: "Focus",
        passwordHash: "hash",
      })
      .returning()
    await database.insert(tasks).values({
      userId: user.id,
      title: "Carry me",
      plannedDate: "2026-07-13",
      pomodoroCount: 2,
    })

    await rollOverTasks(user.id, "2026-07-14", database as unknown as PomoderDb)
    await rollOverTasks(user.id, "2026-07-14", database as unknown as PomoderDb)

    const stored = await database.select().from(tasks)
    expect(stored).toHaveLength(2)
    expect(
      stored.find((task) => task.plannedDate === "2026-07-13")
    ).toMatchObject({ status: "carried" })
    expect(
      stored.find((task) => task.plannedDate === "2026-07-14")
    ).toMatchObject({ status: "active", title: "Carry me", pomodoroCount: 2 })
  })

  it("updates the daily completed-task total when a task is completed or reopened", async () => {
    const [user] = await database
      .insert(users)
      .values({
        email: "tasks@example.com",
        name: "Tasks",
        passwordHash: "hash",
      })
      .returning()
    const [task] = await database
      .insert(tasks)
      .values({ userId: user.id, title: "Count me", plannedDate: "2026-07-14" })
      .returning()

    await toggleTaskStatus(
      user.id,
      task.id,
      "2026-07-14",
      database as unknown as PomoderDb
    )
    expect(
      (await database.select().from(dailyFocusStats))[0]?.tasksCompleted
    ).toBe(1)

    await toggleTaskStatus(
      user.id,
      task.id,
      "2026-07-14",
      database as unknown as PomoderDb
    )
    expect(
      (await database.select().from(dailyFocusStats))[0]?.tasksCompleted
    ).toBe(0)
  })
})

describe("focus task attribution", () => {
  it("increments the linked task exactly once when a focus session completes", async () => {
    const [user] = await database.insert(users).values({ email: "attribution@example.com", name: "Attribution", passwordHash: "hash" }).returning()
    const [task] = await database.insert(tasks).values({ userId: user.id, title: "Write tests", plannedDate: "2026-07-15" }).returning()
    const session = await startProductivitySession(user.id, "2026-07-15", { taskId: task.id, mode: "focus", plannedSeconds: 1_500, idempotencyKey: "task-attribution-test" }, database as unknown as PomoderDb)
    const breakSession = await startProductivitySession(user.id, "2026-07-15", { taskId: task.id, mode: "short", plannedSeconds: 300, idempotencyKey: "break-attribution-test" }, database as unknown as PomoderDb)

    expect(session?.taskId).toBe(task.id)
    expect(breakSession?.taskId).toBeNull()
    const first = await completeProductivitySession(user.id, session!.id, 1_500, "2026-07-15", database as unknown as PomoderDb)
    const duplicate = await completeProductivitySession(user.id, session!.id, 1_500, "2026-07-15", database as unknown as PomoderDb)

    expect(first?.task).toMatchObject({ id: task.id, pomodoroCount: 1 })
    expect(duplicate).toBeNull()
    expect((await database.select().from(tasks))[0]?.pomodoroCount).toBe(1)
    expect((await database.select().from(dailyFocusStats))[0]).toMatchObject({ focusSessions: 1, focusSeconds: 1_500 })
  })
})

describe("timer presets", () => {
  const values = { name: "Writing", focusMinutes: 45, shortBreakMinutes: 8, longBreakMinutes: 20, autoStart: true }

  async function seedPresetUser(email: string) {
    const [user] = await database.insert(users).values({ email, name: "Presets", passwordHash: "hash" }).returning()
    return user
  }

  it("scopes preset listing and mutations to their owner", async () => {
    const owner = await seedPresetUser("preset-owner@example.com")
    const other = await seedPresetUser("preset-other@example.com")
    const created = await createTimerPreset(owner.id, values, database as unknown as PomoderDb)
    expect(created).toMatchObject(values)

    expect(await listTimerPresets(owner.id, database as unknown as PomoderDb)).toHaveLength(1)
    expect(await listTimerPresets(other.id, database as unknown as PomoderDb)).toHaveLength(0)
    await expect(updateTimerPreset(other.id, created.id, values, database as unknown as PomoderDb)).rejects.toThrow("PRESET_NOT_FOUND")
    await expect(deleteTimerPreset(other.id, created.id, database as unknown as PomoderDb)).rejects.toThrow("PRESET_NOT_FOUND")

    const renamed = await updateTimerPreset(owner.id, created.id, { ...values, name: "Writing v2", autoStart: false }, database as unknown as PomoderDb)
    expect(renamed).toMatchObject({ name: "Writing v2", autoStart: false })

    await deleteTimerPreset(owner.id, created.id, database as unknown as PomoderDb)
    expect(await listTimerPresets(owner.id, database as unknown as PomoderDb)).toHaveLength(0)
    await expect(deleteTimerPreset(owner.id, created.id, database as unknown as PomoderDb)).rejects.toThrow("PRESET_NOT_FOUND")
  })

  it("rejects duplicate names per user, case-insensitively", async () => {
    const user = await seedPresetUser("preset-names@example.com")
    const neighbor = await seedPresetUser("preset-neighbor@example.com")
    const first = await createTimerPreset(user.id, values, database as unknown as PomoderDb)
    await expect(createTimerPreset(user.id, { ...values, name: "wRiTing" }, database as unknown as PomoderDb)).rejects.toThrow("PRESET_NAME_TAKEN")
    // The same name is fine on another account.
    await createTimerPreset(neighbor.id, values, database as unknown as PomoderDb)

    const second = await createTimerPreset(user.id, { ...values, name: "Reading" }, database as unknown as PomoderDb)
    await expect(updateTimerPreset(user.id, second.id, { ...values, name: "WRITING" }, database as unknown as PomoderDb)).rejects.toThrow("PRESET_NAME_TAKEN")
    // Renaming a preset to its own name stays allowed.
    await updateTimerPreset(user.id, first.id, values, database as unknown as PomoderDb)
  })

  it("enforces the ten-preset limit inside the transaction", async () => {
    const user = await seedPresetUser("preset-limit@example.com")
    for (let index = 0; index < 10; index += 1) {
      await createTimerPreset(user.id, { ...values, name: `Preset ${index}` }, database as unknown as PomoderDb)
    }
    await expect(createTimerPreset(user.id, { ...values, name: "One too many" }, database as unknown as PomoderDb)).rejects.toThrow("PRESET_LIMIT_REACHED")
    expect(await listTimerPresets(user.id, database as unknown as PomoderDb)).toHaveLength(10)
  })

  it("lets the database reject out-of-bounds durations and blank names", async () => {
    const user = await seedPresetUser("preset-bounds@example.com")
    await expect(database.insert(schema.userTimerPresets).values({ userId: user.id, name: "Bad", focusMinutes: 0, shortBreakMinutes: 5, longBreakMinutes: 15 })).rejects.toThrow()
    await expect(database.insert(schema.userTimerPresets).values({ userId: user.id, name: "Bad", focusMinutes: 25, shortBreakMinutes: 91, longBreakMinutes: 15 })).rejects.toThrow()
    await expect(database.insert(schema.userTimerPresets).values({ userId: user.id, name: "   ", focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15 })).rejects.toThrow()
  })
})

describe("focus history report", () => {
  it("computes the instant a local date starts in a timezone", () => {
    expect(localDateStartInstant("UTC", "2026-07-10").toISOString()).toBe("2026-07-10T00:00:00.000Z")
    expect(localDateStartInstant("America/New_York", "2026-07-10").toISOString()).toBe("2026-07-10T04:00:00.000Z")
    expect(localDateStartInstant("America/New_York", "2026-01-10").toISOString()).toBe("2026-01-10T05:00:00.000Z")
    expect(localDateStartInstant("Asia/Tokyo", "2026-07-10").toISOString()).toBe("2026-07-09T15:00:00.000Z")
  })

  it("reports only completed focus sessions inside the local range with task attribution", async () => {
    const timezone = "America/New_York"
    const today = "2026-07-16"
    const [user] = await database.insert(users).values({ email: "history@example.com", name: "History", passwordHash: "hash", timezone }).returning()
    const [kept] = await database.insert(tasks).values({ userId: user.id, title: "Deep work", plannedDate: "2026-07-15" }).returning()
    const [removed] = await database.insert(tasks).values({ userId: user.id, title: "Removed later", plannedDate: "2026-07-15" }).returning()

    const completed = (key: string, completedAt: string, accumulatedSeconds: number, taskId: string | null = null) =>
      ({ userId: user.id, taskId, mode: "focus", status: "completed", plannedSeconds: 1_500, accumulatedSeconds, completedAt: new Date(completedAt), idempotencyKey: key })
    await database.insert(focusSessions).values([
      // Range starts at 2026-07-10T04:00:00Z in New York; the first row falls
      // on July 9 local time and must stay out of the report.
      completed("before-range", "2026-07-10T03:59:59Z", 1_500, kept.id),
      completed("range-start", "2026-07-10T04:00:00Z", 1_500, kept.id),
      completed("mid-range", "2026-07-15T13:30:00Z", 1_200, kept.id),
      completed("removed-task", "2026-07-15T18:00:00Z", 900, removed.id),
      completed("no-task", "2026-07-16T10:00:00Z", 600),
      { userId: user.id, taskId: kept.id, mode: "focus", status: "cancelled", plannedSeconds: 1_500, accumulatedSeconds: 300, completedAt: null, idempotencyKey: "cancelled" },
      { userId: user.id, taskId: kept.id, mode: "focus", status: "running", plannedSeconds: 1_500, accumulatedSeconds: 0, completedAt: null, idempotencyKey: "running" },
      { userId: user.id, taskId: kept.id, mode: "focus", status: "paused", plannedSeconds: 1_500, accumulatedSeconds: 700, completedAt: null, idempotencyKey: "paused" },
      { userId: user.id, taskId: null, mode: "short", status: "completed", plannedSeconds: 300, accumulatedSeconds: 300, completedAt: new Date("2026-07-15T14:00:00Z"), idempotencyKey: "break" },
    ])
    await database.delete(tasks).where(eq(tasks.id, removed.id))
    await database.insert(dailyFocusStats).values([
      { userId: user.id, localDate: "2026-07-09", focusSessions: 1, focusSeconds: 1_500, tasksCompleted: 0 },
      { userId: user.id, localDate: "2026-07-10", focusSessions: 1, focusSeconds: 1_500, tasksCompleted: 1 },
      { userId: user.id, localDate: "2026-07-15", focusSessions: 2, focusSeconds: 2_100, tasksCompleted: 2 },
      { userId: user.id, localDate: "2026-07-16", focusSessions: 1, focusSeconds: 600, tasksCompleted: 0 },
    ])

    const report = await loadFocusReport(user.id, "7d", today, timezone, 0, database as unknown as PomoderDb)

    expect(report).toMatchObject({ startDate: "2026-07-10", endDate: "2026-07-16" })
    // Aggregate totals line up with the session-level rows in range.
    expect(report.totals).toEqual({ focusSeconds: 4_200, focusSessions: 4, tasksCompleted: 3, activeDays: 3 })
    expect(report.sessions.totalRows).toBe(report.totals.focusSessions)
    expect(report.sessions.rows.reduce((total, row) => total + row.accumulatedSeconds, 0)).toBe(report.totals.focusSeconds)
    expect(report.days.map((day) => day.localDate)).toEqual(["2026-07-10", "2026-07-15", "2026-07-16"])

    expect(report.topTasks[0]).toMatchObject({ taskId: kept.id, title: "Deep work", sessions: 2, focusSeconds: 2_700 })
    const neutral = report.topTasks.filter((task) => task.taskId === null)
    expect(neutral).toHaveLength(1)
    expect(neutral[0]).toMatchObject({ title: null, sessions: 2, focusSeconds: 1_500 })

    const newest = report.sessions.rows[0]
    expect(newest).toMatchObject({ taskTitle: null, accumulatedSeconds: 600, localDate: "2026-07-16", localTime: "06:00" })
    expect(report.sessions.rows.map((row) => row.localDate)).toEqual(["2026-07-16", "2026-07-15", "2026-07-15", "2026-07-10"])
    expect(report.sessions.rows[1]).toMatchObject({ taskTitle: null, accumulatedSeconds: 900 })
    expect(report.sessions.rows[2]).toMatchObject({ taskTitle: "Deep work", localTime: "09:30" })

    const exportable = await loadFocusReportSessions(user.id, "7d", today, timezone, database as unknown as PomoderDb)
    expect(exportable.rows).toHaveLength(4)
    expect(exportable.rows[0]).toMatchObject({ localDate: "2026-07-10", taskTitle: "Deep work" })
    expect(exportable.rows.at(-1)).toMatchObject({ localDate: "2026-07-16", taskTitle: null })
  })

  it("paginates session detail without losing rows", async () => {
    const [user] = await database.insert(users).values({ email: "pages@example.com", name: "Pages", passwordHash: "hash", timezone: "UTC" }).returning()
    await database.insert(focusSessions).values(Array.from({ length: 25 }, (_, index) => ({
      userId: user.id,
      taskId: null,
      mode: "focus",
      status: "completed",
      plannedSeconds: 1_500,
      accumulatedSeconds: 1_500,
      completedAt: new Date(Date.UTC(2026, 6, 16, 8, index)),
      idempotencyKey: `page-${index}`,
    })))

    const first = await loadFocusReport(user.id, "7d", "2026-07-16", "UTC", 0, database as unknown as PomoderDb)
    const second = await loadFocusReport(user.id, "7d", "2026-07-16", "UTC", 1, database as unknown as PomoderDb)

    expect(first.sessions.rows).toHaveLength(REPORT_SESSION_PAGE_SIZE)
    expect(second.sessions.rows).toHaveLength(5)
    expect(first.sessions.totalRows).toBe(25)
    expect(second.sessions.totalRows).toBe(25)
    const seen = new Set([...first.sessions.rows, ...second.sessions.rows].map((row) => row.id))
    expect(seen.size).toBe(25)
    expect(first.sessions.rows[0].localTime).toBe("08:24")
  })

  it("never returns another user's sessions", async () => {
    const [owner] = await database.insert(users).values({ email: "owner@example.com", name: "Owner", passwordHash: "hash", timezone: "UTC" }).returning()
    const [other] = await database.insert(users).values({ email: "other@example.com", name: "Other", passwordHash: "hash", timezone: "UTC" }).returning()
    await database.insert(focusSessions).values({ userId: other.id, taskId: null, mode: "focus", status: "completed", plannedSeconds: 1_500, accumulatedSeconds: 1_500, completedAt: new Date("2026-07-15T10:00:00Z"), idempotencyKey: "other-session" })
    await database.insert(dailyFocusStats).values({ userId: other.id, localDate: "2026-07-15", focusSessions: 1, focusSeconds: 1_500, tasksCompleted: 0 })

    const report = await loadFocusReport(owner.id, "7d", "2026-07-16", "UTC", 0, database as unknown as PomoderDb)
    expect(report.totals).toEqual({ focusSeconds: 0, focusSessions: 0, tasksCompleted: 0, activeDays: 0 })
    expect(report.sessions.totalRows).toBe(0)
    expect(report.topTasks).toHaveLength(0)
  })
})

describe("daily goals and focus streaks", () => {
  it("calculates current and best streaks across gaps and ignores duplicates and future dates", () => {
    expect(calculateFocusStreaks([], "2026-07-15")).toEqual({ currentStreak: 0, bestStreak: 0 })
    expect(calculateFocusStreaks(["2026-07-15", "2026-07-14", "2026-07-14", "2026-07-10", "2026-07-09", "2026-07-08", "2026-07-16"], "2026-07-15")).toEqual({ currentStreak: 2, bestStreak: 3 })
    expect(calculateFocusStreaks(["2026-07-12", "2026-07-11"], "2026-07-15")).toEqual({ currentStreak: 0, bestStreak: 2 })
  })

  it("keeps a streak ending yesterday current through today", () => {
    expect(calculateFocusStreaks(["2026-07-12", "2026-07-13", "2026-07-14"], "2026-07-15")).toEqual({ currentStreak: 3, bestStreak: 3 })
  })

  it("treats timezone-local dates as consecutive across daylight-saving boundaries", () => {
    expect(calculateFocusStreaks(["2026-03-07", "2026-03-08", "2026-03-09"], "2026-03-09")).toEqual({ currentStreak: 3, bestStreak: 3 })
    expect(calculateFocusStreaks(["2026-10-31", "2026-11-01", "2026-11-02"], "2026-11-02")).toEqual({ currentStreak: 3, bestStreak: 3 })
  })

  it("applies a bounded default daily goal in the database", async () => {
    const [user] = await database.insert(users).values({ email: "goals@example.com", name: "Goals", passwordHash: "hash" }).returning()
    const [preferences] = await database.insert(userPreferences).values({ userId: user.id }).returning()
    expect(preferences.dailyGoalSessions).toBe(4)
    await expect(database.update(userPreferences).set({ dailyGoalSessions: 0 })).rejects.toThrow()
    await expect(database.update(userPreferences).set({ dailyGoalSessions: 21 })).rejects.toThrow()
  })

  it("builds goal progress and streak values for productivity responses", () => {
    expect(buildFocusSummary([
      { localDate: "2026-07-13", focusSessions: 2 },
      { localDate: "2026-07-14", focusSessions: 1 },
      { localDate: "2026-07-15", focusSessions: 4 },
    ], "2026-07-15", 4)).toEqual({
      currentStreak: 3,
      bestStreak: 3,
      todayCompletedSessions: 4,
      dailyGoalSessions: 4,
      goalProgress: 1,
      goalCompleted: true,
    })
  })

  it("loads focus summaries only from the requested user's daily stats", async () => {
    const [first, second] = await database.insert(users).values([
      { email: "first-goal@example.com", name: "First", passwordHash: "hash" },
      { email: "second-goal@example.com", name: "Second", passwordHash: "hash" },
    ]).returning()
    await database.insert(dailyFocusStats).values([
      { userId: first.id, localDate: "2026-07-14", focusSessions: 1 },
      { userId: first.id, localDate: "2026-07-15", focusSessions: 2 },
      { userId: second.id, localDate: "2026-07-15", focusSessions: 12 },
    ])

    expect(await loadFocusSummary(first.id, "2026-07-15", 4, database as unknown as PomoderDb)).toEqual({
      currentStreak: 2,
      bestStreak: 2,
      todayCompletedSessions: 2,
      dailyGoalSessions: 4,
      goalProgress: 0.5,
      goalCompleted: false,
    })
  })
})

describe("media and room policies", () => {
  it("validates media signatures instead of trusting the browser MIME type", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    expect(
      validateMediaUpload({
        bytes: png,
        mimeType: "image/png",
        fileSize: png.byteLength,
      })
    ).toEqual({ kind: "image", extension: "png" })
    expect(() =>
      validateMediaUpload({
        bytes: new Uint8Array([1, 2, 3]),
        mimeType: "image/png",
        fileSize: 3,
      })
    ).toThrow("INVALID_FILE_CONTENT")
  })

  it("locks room joins during focus and applies fixed monthly generation caps", () => {
    expect(canJoinRoom("waiting")).toBe(true)
    expect(canJoinRoom("short")).toBe(true)
    expect(canJoinRoom("focus")).toBe(false)
    expect(generationLimit("background")).toBe(5)
    expect(generationLimit("soundscape")).toBe(20)
  })

  it("rejects missing, malformed, and oversized upload lengths before parsing", () => {
    expect(() => validateUploadContentLength(null)).toThrow(
      "CONTENT_LENGTH_REQUIRED"
    )
    expect(() => validateUploadContentLength("not-a-number")).toThrow(
      "INVALID_CONTENT_LENGTH"
    )
    expect(() => validateUploadContentLength("0")).toThrow(
      "INVALID_CONTENT_LENGTH"
    )
    expect(() =>
      validateUploadContentLength(String(102 * 1024 * 1024))
    ).toThrow("FILE_TOO_LARGE")
  })
})

describe("task planning", () => {
  const testDb = () => database as unknown as PomoderDb

  async function createPlanningUser(email: string) {
    const [user] = await database.insert(users).values({ email, name: "Planner", passwordHash: "hash" }).returning()
    return user
  }

  it("backfills a deterministic per-day order for tasks created before the migration", async () => {
    const legacy = new PGlite()
    for (const file of ["0000_custom_shell_baseline.sql", "0003_custom_shell_workspaces.sql", "0004_pomoder_product.sql"]) {
      await legacy.exec(await readFile(new URL(`../../drizzle/${file}`, import.meta.url), "utf8"))
    }
    const inserted = await legacy.query<{ id: string }>(
      "insert into users (email, name, password_hash) values ('legacy@example.com', 'Legacy', 'hash') returning id"
    )
    const userId = inserted.rows[0].id
    await legacy.query(
      `insert into tasks (user_id, title, planned_date, created_at) values
        ($1, 'Second', '2026-07-16', '2026-07-16T09:05:00Z'),
        ($1, 'Third', '2026-07-16', '2026-07-16T10:00:00Z'),
        ($1, 'First', '2026-07-16', '2026-07-16T08:00:00Z'),
        ($1, 'Other day', '2026-07-15', '2026-07-15T08:00:00Z')`,
      [userId]
    )
    await legacy.exec(await readFile(new URL("../../drizzle/0007_working_sound_player.sql", import.meta.url), "utf8"))
    await legacy.exec(await readFile(new URL("../../drizzle/0008_advanced_task_planning.sql", import.meta.url), "utf8"))
    const migrated = await legacy.query<{ title: string; sort_order: number; priority: string; estimated_pomodoros: number | null }>(
      "select title, sort_order, priority, estimated_pomodoros from tasks where planned_date = '2026-07-16' order by sort_order"
    )
    expect(migrated.rows).toEqual([
      { title: "First", sort_order: 1, priority: "normal", estimated_pomodoros: null },
      { title: "Second", sort_order: 2, priority: "normal", estimated_pomodoros: null },
      { title: "Third", sort_order: 3, priority: "normal", estimated_pomodoros: null },
    ])
    const otherDay = await legacy.query<{ sort_order: number }>("select sort_order from tasks where planned_date = '2026-07-15'")
    expect(otherDay.rows).toEqual([{ sort_order: 1 }])
    await legacy.close()
  })

  it("carries planning metadata into the next day's clone exactly once", async () => {
    const user = await createPlanningUser("carry@example.com")
    await database.insert(tasks).values({ userId: user.id, title: "Carry me", plannedDate: "2026-07-15", priority: "high", estimatedPomodoros: 5, sortOrder: 2, pomodoroCount: 1 })

    expect(await rollOverTasks(user.id, "2026-07-16", testDb())).toBe(1)
    expect(await rollOverTasks(user.id, "2026-07-16", testDb())).toBe(0)

    const rows = await database.select().from(tasks).where(eq(tasks.userId, user.id)).orderBy(tasks.plannedDate)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ status: "carried", carriedToTaskId: rows[1].id })
    expect(rows[1]).toMatchObject({ status: "active", plannedDate: "2026-07-16", title: "Carry me", priority: "high", estimatedPomodoros: 5, sortOrder: 2, pomodoroCount: 1 })
  })

  it("only lets the owner edit today's active tasks within bounds", async () => {
    const owner = await createPlanningUser("owner-plan@example.com")
    const stranger = await createPlanningUser("stranger-plan@example.com")
    const [task] = await database.insert(tasks).values({ userId: owner.id, title: "Editable", plannedDate: "2026-07-16", sortOrder: 1 }).returning()
    const [done] = await database.insert(tasks).values({ userId: owner.id, title: "Done", plannedDate: "2026-07-16", status: "completed", sortOrder: 2 }).returning()

    const updated = await updateTaskPlan(owner.id, task.id, "2026-07-16", { title: "Edited", priority: "high", estimatedPomodoros: 4 }, testDb())
    expect(updated).toMatchObject({ title: "Edited", priority: "high", estimatedPomodoros: 4 })
    const cleared = await updateTaskPlan(owner.id, task.id, "2026-07-16", { estimatedPomodoros: null }, testDb())
    expect(cleared.estimatedPomodoros).toBeNull()
    expect(cleared.title).toBe("Edited")

    await expect(updateTaskPlan(stranger.id, task.id, "2026-07-16", { title: "Hijacked" }, testDb())).rejects.toThrow("TASK_NOT_FOUND")
    await expect(updateTaskPlan(owner.id, done.id, "2026-07-16", { title: "Nope" }, testDb())).rejects.toThrow("TASK_NOT_FOUND")
    await expect(updateTaskPlan(owner.id, task.id, "2026-07-17", { title: "Wrong day" }, testDb())).rejects.toThrow("TASK_NOT_FOUND")
    await expect(database.insert(tasks).values({ userId: owner.id, title: "Bad", plannedDate: "2026-07-16", priority: "urgent" })).rejects.toThrow()
    await expect(database.insert(tasks).values({ userId: owner.id, title: "Bad", plannedDate: "2026-07-16", estimatedPomodoros: 25 })).rejects.toThrow()
  })

  it("reorders only today's active tasks atomically and rejects invalid orders", async () => {
    const user = await createPlanningUser("reorder@example.com")
    const stranger = await createPlanningUser("reorder-stranger@example.com")
    const values = (title: string, sortOrder: number, extras: Partial<typeof tasks.$inferInsert> = {}) => ({ userId: user.id, title, plannedDate: "2026-07-16", sortOrder, ...extras })
    const [first] = await database.insert(tasks).values(values("First", 1)).returning()
    const [second] = await database.insert(tasks).values(values("Second", 2)).returning()
    const [third] = await database.insert(tasks).values(values("Third", 3)).returning()
    const [done] = await database.insert(tasks).values(values("Done", 4, { status: "completed" })).returning()
    const [yesterday] = await database.insert(tasks).values(values("Yesterday", 1, { plannedDate: "2026-07-15" })).returning()
    const [foreign] = await database.insert(tasks).values({ userId: stranger.id, title: "Foreign", plannedDate: "2026-07-16", sortOrder: 1 }).returning()

    await expect(reorderTodayTasks(user.id, "2026-07-16", [third.id, first.id], testDb())).rejects.toThrow("TASK_ORDER_MISMATCH")
    await expect(reorderTodayTasks(user.id, "2026-07-16", [third.id, first.id, first.id], testDb())).rejects.toThrow("TASK_ORDER_MISMATCH")
    await expect(reorderTodayTasks(user.id, "2026-07-16", [third.id, first.id, foreign.id], testDb())).rejects.toThrow("TASK_ORDER_MISMATCH")
    await expect(reorderTodayTasks(user.id, "2026-07-16", [third.id, first.id, done.id], testDb())).rejects.toThrow("TASK_ORDER_MISMATCH")
    await expect(reorderTodayTasks(user.id, "2026-07-16", [third.id, first.id, yesterday.id], testDb())).rejects.toThrow("TASK_ORDER_MISMATCH")

    await reorderTodayTasks(user.id, "2026-07-16", [third.id, first.id, second.id], testDb())
    await reorderTodayTasks(user.id, "2026-07-16", [second.id, third.id, first.id], testDb())

    const ordered = await database.select({ title: tasks.title }).from(tasks).where(and(eq(tasks.userId, user.id), eq(tasks.plannedDate, "2026-07-16"), eq(tasks.status, "active"))).orderBy(tasks.sortOrder)
    expect(ordered.map((row) => row.title)).toEqual(["Second", "Third", "First"])
    const [untouchedYesterday] = await database.select({ sortOrder: tasks.sortOrder }).from(tasks).where(eq(tasks.id, yesterday.id))
    expect(untouchedYesterday.sortOrder).toBe(1)
    const [untouchedDone] = await database.select({ sortOrder: tasks.sortOrder }).from(tasks).where(eq(tasks.id, done.id))
    expect(untouchedDone.sortOrder).toBe(4)
    const [untouchedForeign] = await database.select({ sortOrder: tasks.sortOrder }).from(tasks).where(eq(tasks.id, foreign.id))
    expect(untouchedForeign.sortOrder).toBe(1)
  })
})

describe("sound preferences", () => {
  const testDb = () => database as unknown as PomoderDb

  async function createSoundUser(email: string) {
    const [user] = await database
      .insert(users)
      .values({ email, name: "Listener", passwordHash: "hash" })
      .returning()
    return user
  }

  async function createAudioAsset(ownerUserId: string | null, status: string, kind = "audio") {
    const [asset] = await database
      .insert(mediaAssets)
      .values({
        ownerUserId,
        kind,
        source: ownerUserId ? "upload" : "curated",
        status,
        name: "Loop",
        storageKey: `test/${crypto.randomUUID()}.mp3`,
        mimeType: "audio/mpeg",
        fileSize: 1_000,
      })
      .returning()
    return asset
  }

  it("stores curated selections and clamps invalid values to safe defaults", async () => {
    const user = await createSoundUser("sound@example.com")
    const saved = await applySoundPreferences(
      user.id,
      { selectedSound: "curated:rain", soundVolume: 400, soundMuted: false, completionAlerts: true },
      testDb()
    )
    expect(saved).toEqual({ selectedSound: "curated:rain", soundVolume: 100, soundMuted: false, completionAlerts: true })

    const invalid = await applySoundPreferences(
      user.id,
      { selectedSound: "curated:vaporwave", soundVolume: -5, soundMuted: true, completionAlerts: false },
      testDb()
    )
    expect(invalid).toEqual({ selectedSound: null, soundVolume: 0, soundMuted: true, completionAlerts: false })
  })

  it("only lets a user select ready audio they are authorized to play", async () => {
    const owner = await createSoundUser("owner@example.com")
    const stranger = await createSoundUser("stranger@example.com")
    const readyAudio = await createAudioAsset(owner.id, "ready")
    const queuedAudio = await createAudioAsset(owner.id, "queued")
    const readyVideo = await createAudioAsset(owner.id, "ready", "video")
    const sharedAudio = await createAudioAsset(null, "ready")

    expect(await resolveStorableSoundReference(owner.id, `media:${readyAudio.id}`, testDb())).toBe(`media:${readyAudio.id}`)
    expect(await resolveStorableSoundReference(owner.id, `media:${sharedAudio.id}`, testDb())).toBe(`media:${sharedAudio.id}`)
    expect(await resolveStorableSoundReference(owner.id, `media:${queuedAudio.id}`, testDb())).toBeNull()
    expect(await resolveStorableSoundReference(owner.id, `media:${readyVideo.id}`, testDb())).toBeNull()
    expect(await resolveStorableSoundReference(stranger.id, `media:${readyAudio.id}`, testDb())).toBeNull()
    expect(await resolveStorableSoundReference(owner.id, `media:${crypto.randomUUID()}`, testDb())).toBeNull()
  })

  it("loads defaults for missing rows and silences unknown stored references", async () => {
    const user = await createSoundUser("fresh@example.com")
    expect(await loadSoundPreferences(user.id, testDb())).toEqual(defaultSoundPreferences)

    await database.insert(userPreferences).values({ userId: user.id, selectedSound: "curated:zzz", soundVolume: 30 })
    expect(await loadSoundPreferences(user.id, testDb())).toEqual({
      selectedSound: null,
      soundVolume: 30,
      soundMuted: false,
      completionAlerts: false,
    })
  })

  it("enforces sound bounds in the database and drops the legacy sound column", async () => {
    const user = await createSoundUser("bounds@example.com")
    await expect(
      database.insert(userPreferences).values({ userId: user.id, soundVolume: 150 })
    ).rejects.toThrow()
    await expect(
      database.insert(userPreferences).values({ userId: user.id, selectedSound: "sound:oops" })
    ).rejects.toThrow()
    await database.insert(userPreferences).values({ userId: user.id, soundVolume: 100, selectedSound: "curated:rain" })

    const columns = await client.query<{ column_name: string }>(
      "select column_name from information_schema.columns where table_name = 'user_preferences'"
    )
    const names = columns.rows.map((row) => row.column_name)
    expect(names).toContain("selected_sound")
    expect(names).not.toContain("selected_sound_id")
  })
})

describe("background preferences", () => {
  const testDb = () => database as unknown as PomoderDb

  async function createBackgroundUser(email: string) {
    const [user] = await database
      .insert(users)
      .values({ email, name: "Viewer", passwordHash: "hash" })
      .returning()
    return user
  }

  async function createVisualAsset(ownerUserId: string | null, status: string, kind = "image") {
    const [asset] = await database
      .insert(mediaAssets)
      .values({
        ownerUserId,
        kind,
        source: ownerUserId ? "upload" : "curated",
        status,
        name: "Scene",
        storageKey: `test/${crypto.randomUUID()}.bin`,
        mimeType: kind === "video" ? "video/mp4" : "image/png",
        fileSize: 1_000,
      })
      .returning()
    return asset
  }

  it("stores curated scenes and rejects unknown scene keys", async () => {
    const user = await createBackgroundUser("scene@example.com")
    expect(await applyBackgroundPreference(user.id, "scene:ocean", testDb())).toEqual({ type: "scene", key: "ocean" })
    // An unknown scene falls back to the default rather than storing garbage.
    expect(await applyBackgroundPreference(user.id, "scene:nope", testDb())).toEqual({ type: "scene", key: "lofi" })
    const [row] = await database.select({ selectedBackground: userPreferences.selectedBackground }).from(userPreferences).where(eq(userPreferences.userId, user.id))
    expect(row.selectedBackground).toBeNull()
  })

  it("only lets a user select a ready image or video they can view", async () => {
    const owner = await createBackgroundUser("owner-bg@example.com")
    const stranger = await createBackgroundUser("stranger-bg@example.com")
    const readyImage = await createVisualAsset(owner.id, "ready", "image")
    const readyVideo = await createVisualAsset(owner.id, "ready", "video")
    const queuedVideo = await createVisualAsset(owner.id, "queued", "video")
    const readyAudio = await createVisualAsset(owner.id, "ready", "audio")
    const sharedImage = await createVisualAsset(null, "ready", "image")

    expect(await resolveBackgroundReference(owner.id, `media:${readyImage.id}`, testDb())).toEqual({ type: "media", mediaId: readyImage.id, mediaKind: "image" })
    expect(await resolveBackgroundReference(owner.id, `media:${readyVideo.id}`, testDb())).toEqual({ type: "media", mediaId: readyVideo.id, mediaKind: "video" })
    expect(await resolveBackgroundReference(owner.id, `media:${sharedImage.id}`, testDb())).toEqual({ type: "media", mediaId: sharedImage.id, mediaKind: "image" })
    expect(await resolveBackgroundReference(owner.id, `media:${queuedVideo.id}`, testDb())).toBeNull()
    expect(await resolveBackgroundReference(owner.id, `media:${readyAudio.id}`, testDb())).toBeNull()
    expect(await resolveBackgroundReference(stranger.id, `media:${readyImage.id}`, testDb())).toBeNull()
    expect(await resolveBackgroundReference(owner.id, `media:${crypto.randomUUID()}`, testDb())).toBeNull()
  })

  it("loads the default scene for missing rows, unset values, and deleted uploads", async () => {
    const user = await createBackgroundUser("fresh-bg@example.com")
    // No preferences row yet.
    expect(await loadBackgroundPreference(user.id, testDb())).toEqual({ type: "scene", key: "lofi" })

    const image = await createVisualAsset(user.id, "ready", "image")
    await applyBackgroundPreference(user.id, `media:${image.id}`, testDb())
    expect(await loadBackgroundPreference(user.id, testDb())).toEqual({ type: "media", mediaId: image.id, mediaKind: "image" })

    // Deleting the active upload cleanly falls back to the default scene.
    await database.delete(mediaAssets).where(eq(mediaAssets.id, image.id))
    expect(await loadBackgroundPreference(user.id, testDb())).toEqual({ type: "scene", key: "lofi" })
  })

  it("enforces the background reference format in the database", async () => {
    const user = await createBackgroundUser("bg-bounds@example.com")
    await expect(
      database.insert(userPreferences).values({ userId: user.id, selectedBackground: "background:oops" })
    ).rejects.toThrow()
    await database.insert(userPreferences).values({ userId: user.id, selectedBackground: "scene:plain" })

    const columns = await client.query<{ column_name: string }>(
      "select column_name from information_schema.columns where table_name = 'user_preferences'"
    )
    const names = columns.rows.map((row) => row.column_name)
    expect(names).toContain("selected_background")
    expect(names).not.toContain("selected_background_id")
  })
})

describe("authentication hardening", () => {
  it("counts concurrent requests atomically and blocks attempts over the limit", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () =>
        enforceRateLimit(
          "login:test",
          { maxAttempts: 5, windowSeconds: 900 },
          database as unknown as PomoderDb
        )
      )
    )

    expect(results.filter((result) => result.status === "rejected")).toHaveLength(
      1
    )
    expect((await database.select().from(rateLimits))[0]).toMatchObject({
      attempts: 6,
    })
  })

  it("allows a one-time authentication token to be consumed only once", async () => {
    const [user] = await database
      .insert(users)
      .values({
        email: "token@example.com",
        name: "Token",
        passwordHash: "hash",
      })
      .returning()
    const tokenHash = "b".repeat(64)
    await database.insert(authTokens).values({
      userId: user.id,
      tokenHash,
      purpose: "reset_password",
      expiresAt: new Date(Date.now() + 60_000),
    })

    const results = await Promise.allSettled(
      Array.from({ length: 2 }, () =>
        database.transaction((transaction) =>
          consumeAuthToken(
            tokenHash,
            "reset_password",
            new Date(),
            transaction as never
          )
        )
      )
    )

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(
      1
    )
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(
      1
    )
  })
})

describe("Pomoder admin deletion", () => {
  it("deletes one or many records", async () => {
    const [actor] = await database
      .insert(users)
      .values({
        email: "admin@example.com",
        name: "Admin",
        passwordHash: "hash",
        role: "admin",
      })
      .returning()
    const [member] = await database
      .insert(users)
      .values({
        email: "member@example.com",
        name: "Member",
        passwordHash: "hash",
      })
      .returning()
    const inserted = await database
      .insert(tasks)
      .values([
        { userId: member.id, title: "First", plannedDate: "2026-07-14" },
        { userId: member.id, title: "Second", plannedDate: "2026-07-14" },
      ])
      .returning()

    await applyPomoderAdminAction(
      actor.id,
      {
        type: "delete_records",
        resource: "tasks",
        ids: inserted.map((task) => task.id),
      },
      database as unknown as PomoderDb
    )

    expect(await database.select().from(tasks)).toHaveLength(0)
    expect(await database.select().from(adminAuditLogs)).toMatchObject([
      {
        actorUserId: actor.id,
        action: "delete",
        resource: "tasks",
        recordIds: inserted.map((task) => task.id),
      },
    ])
  })

  it("does not allow an administrator to delete their own account", async () => {
    const [actor] = await database
      .insert(users)
      .values({
        email: "admin@example.com",
        name: "Admin",
        passwordHash: "hash",
        role: "admin",
      })
      .returning()

    await expect(
      applyPomoderAdminAction(
        actor.id,
        { type: "delete_records", resource: "users", ids: [actor.id] },
        database as unknown as PomoderDb
      )
    ).rejects.toThrow("CANNOT_DELETE_SELF")
    expect(await database.select().from(users)).toHaveLength(1)
  })

  it("durably queues owned objects when media or its owner is deleted", async () => {
    const [actor] = await database
      .insert(users)
      .values({
        email: "admin@example.com",
        name: "Admin",
        passwordHash: "hash",
        role: "admin",
      })
      .returning()
    const [member] = await database
      .insert(users)
      .values({
        email: "member@example.com",
        name: "Member",
        passwordHash: "hash",
      })
      .returning()
    await database.insert(mediaAssets).values({
      ownerUserId: member.id,
      kind: "image",
      source: "upload",
      status: "ready",
      name: "Owned",
      storageKey: `users/${member.id}/owned.png`,
      thumbnailKey: `users/${member.id}/thumb.png`,
      mimeType: "image/png",
      fileSize: 100,
    })

    await applyPomoderAdminAction(
      actor.id,
      { type: "delete_records", resource: "users", ids: [member.id] },
      database as unknown as PomoderDb
    )

    expect(
      (await database.select().from(storageDeletionJobs))
        .map((job) => job.storageKey)
        .sort()
    ).toEqual(
      [`users/${member.id}/owned.png`, `users/${member.id}/thumb.png`].sort()
    )
    const removed: string[] = []
    await processStorageDeletionJobs(
      database as unknown as PomoderDb,
      async (storageKey) => {
        removed.push(storageKey)
      }
    )
    expect(removed.sort()).toEqual(
      [`users/${member.id}/owned.png`, `users/${member.id}/thumb.png`].sort()
    )
    expect(await database.select().from(storageDeletionJobs)).toHaveLength(0)
  })

  it("retains failed storage deletion jobs for retry", async () => {
    await database
      .insert(storageDeletionJobs)
      .values({ storageKey: "curated/retry.png" })
    await processStorageDeletionJobs(
      database as unknown as PomoderDb,
      async () => {
        throw new Error("STORAGE_UNAVAILABLE")
      }
    )
    expect(await database.select().from(storageDeletionJobs)).toMatchObject([
      {
        storageKey: "curated/retry.png",
        attempts: 1,
        lastError: "STORAGE_UNAVAILABLE",
      },
    ])
  })

  it("queues the original object after a processed upload replaces it", async () => {
    const [member] = await database
      .insert(users)
      .values({
        email: "media-owner@example.com",
        name: "Media owner",
        passwordHash: "hash",
      })
      .returning()
    const [asset] = await database
      .insert(mediaAssets)
      .values({
        ownerUserId: member.id,
        kind: "video",
        source: "upload",
        status: "processing",
        name: "Original",
        storageKey: `users/${member.id}/original.mp4`,
        mimeType: "video/mp4",
        fileSize: 100,
      })
      .returning()
    const processedKey = `users/${member.id}/${asset.id}/processed.mp4`

    await finalizeProcessedUpload(
      asset,
      processedKey,
      "video/mp4",
      80,
      database as unknown as PomoderDb
    )

    expect((await database.select().from(mediaAssets))[0]).toMatchObject({
      storageKey: processedKey,
      status: "ready",
    })
    expect(await database.select().from(storageDeletionJobs)).toMatchObject([
      { storageKey: `users/${member.id}/original.mp4` },
    ])
  })
})

describe("Pomoder admin record management", () => {
  it("rejects updates for records that do not exist", async () => {
    const [actor] = await database
      .insert(users)
      .values({
        email: "admin@example.com",
        name: "Admin",
        passwordHash: "hash",
        role: "admin",
      })
      .returning()

    await expect(
      applyPomoderAdminAction(
        actor.id,
        {
          type: "update_record",
          id: crypto.randomUUID(),
          record: {
            resource: "tasks",
            userId: actor.id,
            title: "Missing task",
            plannedDate: "2026-07-14",
            status: "active",
            pomodoroCount: 0,
          },
        },
        database as unknown as PomoderDb
      )
    ).rejects.toThrow("RECORD_NOT_FOUND")
    expect(await database.select().from(adminAuditLogs)).toHaveLength(0)
  })

  it("creates and edits a task", async () => {
    const [actor] = await database
      .insert(users)
      .values({
        email: "admin@example.com",
        name: "Admin",
        passwordHash: "hash",
        role: "admin",
      })
      .returning()
    const [member] = await database
      .insert(users)
      .values({
        email: "member@example.com",
        name: "Member",
        passwordHash: "hash",
      })
      .returning()

    await applyPomoderAdminAction(
      actor.id,
      {
        type: "create_record",
        record: {
          resource: "tasks",
          userId: member.id,
          title: "Admin task",
          plannedDate: "2026-07-14",
          status: "active",
          pomodoroCount: 1,
        },
      } satisfies PomoderAdminAction,
      database as unknown as PomoderDb
    )

    const [created] = await database.select().from(tasks)
    expect(created).toMatchObject({
      title: "Admin task",
      status: "active",
      pomodoroCount: 1,
    })

    await applyPomoderAdminAction(
      actor.id,
      {
        type: "update_record",
        id: created.id,
        record: {
          resource: "tasks",
          userId: member.id,
          title: "Updated task",
          plannedDate: "2026-07-15",
          status: "completed",
          pomodoroCount: 3,
        },
      } satisfies PomoderAdminAction,
      database as unknown as PomoderDb
    )

    expect((await database.select().from(tasks))[0]).toMatchObject({
      title: "Updated task",
      plannedDate: "2026-07-15",
      status: "completed",
      pomodoroCount: 3,
    })
  })

  it("creates and edits a user", async () => {
    const [actor] = await database
      .insert(users)
      .values({
        email: "admin@example.com",
        name: "Admin",
        passwordHash: "hash",
        role: "admin",
      })
      .returning()
    await applyPomoderAdminAction(
      actor.id,
      {
        type: "create_record",
        record: {
          resource: "users",
          email: "created@example.com",
          name: "Created",
          role: "user",
          verified: true,
          password: "password123",
        },
      } satisfies PomoderAdminAction,
      database as unknown as PomoderDb
    )

    const created = (await database.select().from(users)).find(
      (user) => user.email === "created@example.com"
    )!
    expect(created).toMatchObject({ name: "Created", role: "user" })
    expect(created.emailVerifiedAt).toBeInstanceOf(Date)

    await applyPomoderAdminAction(
      actor.id,
      {
        type: "update_record",
        id: created.id,
        record: {
          resource: "users",
          email: "edited@example.com",
          name: "Edited",
          role: "admin",
          verified: false,
        },
      } satisfies PomoderAdminAction,
      database as unknown as PomoderDb
    )

    expect(
      (await database.select().from(users)).find(
        (user) => user.id === created.id
      )
    ).toMatchObject({
      email: "edited@example.com",
      name: "Edited",
      role: "admin",
      emailVerifiedAt: null,
    })
  })

  it("revokes existing sessions only when an administrator changes a password", async () => {
    const [actor] = await database
      .insert(users)
      .values({
        email: "admin@example.com",
        name: "Admin",
        passwordHash: "hash",
        role: "admin",
      })
      .returning()
    const [member] = await database
      .insert(users)
      .values({
        email: "member@example.com",
        name: "Member",
        passwordHash: "old-hash",
      })
      .returning()
    await database.insert(sessions).values({
      userId: member.id,
      tokenHash: "a".repeat(64),
      expiresAt: new Date("2026-08-14T00:00:00Z"),
    })

    await applyPomoderAdminAction(
      actor.id,
      {
        type: "update_record",
        id: member.id,
        record: {
          resource: "users",
          email: member.email,
          name: member.name,
          role: "user",
          verified: false,
        },
      } satisfies PomoderAdminAction,
      database as unknown as PomoderDb
    )
    expect(await database.select().from(sessions)).toHaveLength(1)

    await applyPomoderAdminAction(
      actor.id,
      {
        type: "update_record",
        id: member.id,
        record: {
          resource: "users",
          email: member.email,
          name: member.name,
          role: "user",
          verified: false,
          password: "new-password",
        },
      } satisfies PomoderAdminAction,
      database as unknown as PomoderDb
    )
    expect(await database.select().from(sessions)).toHaveLength(0)
    expect(
      (await database.select().from(adminAuditLogs)).filter(
        (log) => log.action === "update"
      )
    ).toHaveLength(2)
  })

  it("creates and edits rooms and focus sessions", async () => {
    const [actor] = await database
      .insert(users)
      .values({
        email: "admin@example.com",
        name: "Admin",
        passwordHash: "hash",
        role: "admin",
      })
      .returning()
    await applyPomoderAdminAction(
      actor.id,
      {
        type: "create_record",
        record: {
          resource: "rooms",
          hostUserId: actor.id,
          slug: "admin-room",
          name: "Admin room",
          visibility: "public",
          phase: "waiting",
          focusMinutes: 25,
          shortBreakMinutes: 5,
          longBreakMinutes: 15,
          autoStart: false,
        },
      } satisfies PomoderAdminAction,
      database as unknown as PomoderDb
    )
    const [room] = await database.select().from(rooms)
    expect(room.name).toBe("Admin room")

    await applyPomoderAdminAction(
      actor.id,
      {
        type: "update_record",
        id: room.id,
        record: {
          resource: "rooms",
          hostUserId: actor.id,
          slug: "edited-room",
          name: "Edited room",
          visibility: "unlisted",
          phase: "waiting",
          focusMinutes: 50,
          shortBreakMinutes: 10,
          longBreakMinutes: 20,
          autoStart: true,
        },
      } satisfies PomoderAdminAction,
      database as unknown as PomoderDb
    )
    expect((await database.select().from(rooms))[0]).toMatchObject({
      name: "Edited room",
      visibility: "unlisted",
      focusMinutes: 50,
      autoStart: true,
    })

    await applyPomoderAdminAction(
      actor.id,
      {
        type: "create_record",
        record: {
          resource: "sessions",
          userId: actor.id,
          taskId: null,
          roomId: room.id,
          mode: "focus",
          status: "running",
          plannedSeconds: 1500,
          accumulatedSeconds: 0,
        },
      } satisfies PomoderAdminAction,
      database as unknown as PomoderDb
    )
    const [session] = await database.select().from(focusSessions)
    expect(session).toMatchObject({ mode: "focus", plannedSeconds: 1500 })

    await applyPomoderAdminAction(
      actor.id,
      {
        type: "update_record",
        id: session.id,
        record: {
          resource: "sessions",
          userId: actor.id,
          taskId: null,
          roomId: room.id,
          mode: "short",
          status: "completed",
          plannedSeconds: 300,
          accumulatedSeconds: 300,
        },
      } satisfies PomoderAdminAction,
      database as unknown as PomoderDb
    )
    expect((await database.select().from(focusSessions))[0]).toMatchObject({
      mode: "short",
      status: "completed",
      accumulatedSeconds: 300,
    })
  })

  it("creates and edits media, billing, AI usage, and reports", async () => {
    const [actor] = await database
      .insert(users)
      .values({
        email: "admin@example.com",
        name: "Admin",
        passwordHash: "hash",
        role: "admin",
      })
      .returning()
    const [room] = await database
      .insert(rooms)
      .values({
        hostUserId: actor.id,
        slug: "report-room",
        name: "Report room",
      })
      .returning()
    const records: PomoderAdminCreateRecord[] = [
      {
        resource: "media",
        ownerUserId: actor.id,
        kind: "audio",
        source: "curated",
        status: "ready",
        name: "Rain",
        storageKey: `users/${actor.id}/rain.mp3`,
        mimeType: "audio/mpeg",
        fileSize: 100,
        premium: false,
      },
      {
        resource: "billing",
        userId: actor.id,
        stripeCustomerId: "cus_admin",
        stripeSubscriptionId: "sub_admin",
        status: "active",
        priceId: "price_pro",
        currentPeriodEnd: "2026-08-14T00:00:00.000Z",
        cancelAtPeriodEnd: false,
      },
      {
        resource: "ai",
        userId: actor.id,
        month: "2026-07-01",
        kind: "background",
        reserved: 1,
        completed: 2,
        refunded: 0,
      },
      {
        resource: "reports",
        roomId: room.id,
        reporterUserId: actor.id,
        reason: "Admin review",
      },
    ]
    for (const record of records) {
      await applyPomoderAdminAction(
        actor.id,
        { type: "create_record", record } satisfies PomoderAdminAction,
        database as unknown as PomoderDb
      )
    }

    expect(await database.select().from(mediaAssets)).toHaveLength(1)
    expect(await database.select().from(subscriptions)).toHaveLength(1)
    expect(await database.select().from(generationUsage)).toHaveLength(1)
    expect(await database.select().from(roomReports)).toHaveLength(1)

    const [media] = await database.select().from(mediaAssets)
    await applyPomoderAdminAction(
      actor.id,
      {
        type: "update_record",
        id: media.id,
        record: {
          resource: "media",
          status: "ready",
          name: "Heavy rain",
          mimeType: "audio/mpeg",
          fileSize: 200,
          premium: true,
        },
      } satisfies PomoderAdminAction,
      database as unknown as PomoderDb
    )
    expect((await database.select().from(mediaAssets))[0]).toMatchObject({
      name: "Heavy rain",
      fileSize: 200,
      premium: true,
    })

    const [subscription] = await database.select().from(subscriptions)
    await applyPomoderAdminAction(
      actor.id,
      {
        type: "update_record",
        id: subscription.id,
        record: {
          resource: "billing",
          userId: actor.id,
          stripeCustomerId: "cus_admin",
          stripeSubscriptionId: "sub_admin",
          status: "canceled",
          priceId: "price_pro",
          currentPeriodEnd: null,
          cancelAtPeriodEnd: true,
        },
      } satisfies PomoderAdminAction,
      database as unknown as PomoderDb
    )
    expect((await database.select().from(subscriptions))[0]).toMatchObject({
      status: "canceled",
      cancelAtPeriodEnd: true,
    })

    const [usage] = await database.select().from(generationUsage)
    await applyPomoderAdminAction(
      actor.id,
      {
        type: "update_record",
        id: usage.id,
        record: {
          resource: "ai",
          userId: actor.id,
          month: "2026-07-01",
          kind: "background",
          reserved: 0,
          completed: 4,
          refunded: 1,
        },
      } satisfies PomoderAdminAction,
      database as unknown as PomoderDb
    )
    expect((await database.select().from(generationUsage))[0]).toMatchObject({
      completed: 4,
      refunded: 1,
    })

    const [report] = await database.select().from(roomReports)
    await applyPomoderAdminAction(
      actor.id,
      {
        type: "update_record",
        id: report.id,
        record: {
          resource: "reports",
          roomId: room.id,
          reporterUserId: actor.id,
          reason: "Updated review",
        },
      } satisfies PomoderAdminAction,
      database as unknown as PomoderDb
    )
    expect((await database.select().from(roomReports))[0].reason).toBe(
      "Updated review"
    )
  })

  it("rejects invalid create input at the admin API boundary", () => {
    expect(
      adminCreateActionSchema.safeParse({
        type: "create_record",
        record: {
          resource: "users",
          email: "not-an-email",
          name: "",
          role: "owner",
          verified: true,
          password: "short",
        },
      }).success
    ).toBe(false)
    expect(
      adminCreateActionSchema.safeParse({
        type: "create_record",
        record: {
          resource: "tasks",
          userId: "user",
          title: "",
          plannedDate: "not-a-date",
          status: "active",
          pomodoroCount: -1,
        },
      }).success
    ).toBe(false)
    expect(
      adminCreateActionSchema.safeParse({
        type: "create_record",
        record: {
          resource: "media",
          ownerUserId: "user-id",
          kind: "image",
          source: "upload",
          status: "ready",
          name: "Cross owner",
          storageKey: "users/another-user/private.png",
          mimeType: "image/png",
          fileSize: 1,
          premium: false,
        },
      }).success
    ).toBe(false)
  })

  it("paginates management records without a hidden 100-row ceiling", async () => {
    const [member] = await database
      .insert(users)
      .values({
        email: "member@example.com",
        name: "Member",
        passwordHash: "hash",
      })
      .returning()
    await database.insert(tasks).values(
      Array.from({ length: 31 }, (_, index) => ({
        userId: member.id,
        title: `Task ${index + 1}`,
        plannedDate: "2026-07-14",
      }))
    )

    const result = await loadPomoderAdminData(
      { section: "tasks", page: 2, pageSize: 10, sortColumn: 0, sortDirection: "asc", reportStatus: "all" },
      database as unknown as PomoderDb
    )
    expect(result.pagination).toEqual({
      page: 2,
      pageSize: 10,
      total: 31,
      totalPages: 4,
    })
    expect(result.tasks).toHaveLength(10)
    expect(result.lookups.tasks).toHaveLength(31)
  })

  it("sorts the full result set before applying pagination", async () => {
    const [member] = await database
      .insert(users)
      .values({
        email: "sort@example.com",
        name: "Sort",
        passwordHash: "hash",
      })
      .returning()
    await database.insert(tasks).values(
      Array.from({ length: 25 }, (_, index) => ({
        userId: member.id,
        title: `Task ${String.fromCharCode(65 + index)}`,
        plannedDate: "2026-07-14",
      }))
    )

    const result = await loadPomoderAdminData(
      {
        section: "tasks",
        page: 2,
        pageSize: 10,
        sortColumn: 1,
        sortDirection: "desc",
        reportStatus: "all",
      },
      database as unknown as PomoderDb
    )

    expect(result.tasks.map(({ task }) => task.title)).toEqual([
      "Task O",
      "Task N",
      "Task M",
      "Task L",
      "Task K",
      "Task J",
      "Task I",
      "Task H",
      "Task G",
      "Task F",
    ])
  })
})

describe("room controls", () => {
  const roomDb = () => database as unknown as PomoderDb
  const baseSettings = { name: "Deep Work", visibility: "public" as const, focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, autoStart: false }

  async function seedRoomUser(email: string, name: string, publicDisplayName: string | null = null) {
    const [user] = await database.insert(users).values({ email, name, publicDisplayName, passwordHash: "hash" }).returning()
    return user
  }

  async function activeMemberships(userId: string) {
    return database.select().from(roomMemberships).where(and(eq(roomMemberships.userId, userId), isNull(roomMemberships.leftAt)))
  }

  it("lets only the host advance phases and guards worker jobs by sequence", async () => {
    const host = await seedRoomUser("host@example.com", "Host")
    const member = await seedRoomUser("member@example.com", "Member")
    const { room } = await createRoomWithHost(host.id, "deep-work-room-1", baseSettings, roomDb())
    await joinRoomBySlug(room.slug, member.id, roomDb())

    await expect(applyHostRoomAction(room.slug, member.id, "start_focus", roomDb())).rejects.toThrow("ROOM_HOST_REQUIRED")

    const startedAt = new Date("2026-07-16T10:00:00Z")
    const started = await applyHostRoomAction(room.slug, host.id, "start_focus", roomDb(), startedAt)
    expect(started.room).toMatchObject({ phase: "focus", sequence: 1, cycleFocusCount: 0 })
    expect(started.transitionAt?.getTime()).toBe(startedAt.getTime() + 25 * 60_000)

    const stale = await advanceExpiredRoom(room.id, 0, roomDb(), new Date("2026-07-16T10:30:00Z"))
    expect(stale.kind).toBe("stale")
    const [unchanged] = await database.select().from(rooms).where(eq(rooms.id, room.id))
    expect(unchanged).toMatchObject({ phase: "focus", sequence: 1 })

    const early = await advanceExpiredRoom(room.id, 1, roomDb(), new Date("2026-07-16T10:10:00Z"))
    expect(early.kind).toBe("not_due")

    const due = await advanceExpiredRoom(room.id, 1, roomDb(), new Date("2026-07-16T10:25:00Z"))
    if (due.kind !== "advanced") throw new Error(`expected advance, got ${due.kind}`)
    expect(due.room).toMatchObject({ phase: "short", sequence: 2, cycleFocusCount: 1 })
    expect(due.transitionAt?.getTime()).toBe(new Date("2026-07-16T10:30:00Z").getTime())
  })

  it("gives the fourth focus period a long break and resets after it", async () => {
    const host = await seedRoomUser("cycle-host@example.com", "Host")
    const { room: created } = await createRoomWithHost(host.id, "cadence-room-01", { ...baseSettings, autoStart: true }, roomDb())
    const started = await applyHostRoomAction(created.slug, host.id, "start_focus", roomDb(), new Date("2026-07-16T09:00:00Z"))

    let room = started.room
    const phases: string[] = []
    for (let step = 0; step < 8; step += 1) {
      const advanced = await advanceExpiredRoom(room.id, room.sequence, roomDb(), room.phaseEndsAt as Date)
      if (advanced.kind !== "advanced") throw new Error(`expected advance at step ${step}, got ${advanced.kind}`)
      room = advanced.room
      phases.push(room.phase)
      expect(advanced.transitionAt?.getTime()).toBe(room.phaseEndsAt?.getTime())
    }

    expect(phases).toEqual(["short", "focus", "short", "focus", "short", "focus", "long", "focus"])
    expect(room.cycleFocusCount).toBe(0)
  })

  it("waits for the host after a break when autoStart is off", async () => {
    const host = await seedRoomUser("manual-host@example.com", "Host")
    const { room: created } = await createRoomWithHost(host.id, "manual-room-001", baseSettings, roomDb())
    const started = await applyHostRoomAction(created.slug, host.id, "start_focus", roomDb(), new Date("2026-07-16T09:00:00Z"))

    const toBreak = await advanceExpiredRoom(created.id, started.room.sequence, roomDb(), started.room.phaseEndsAt as Date)
    if (toBreak.kind !== "advanced") throw new Error("expected the focus phase to advance")
    expect(toBreak.room.phase).toBe("short")
    expect(toBreak.transitionAt).not.toBeNull()

    const toWaiting = await advanceExpiredRoom(created.id, toBreak.room.sequence, roomDb(), toBreak.room.phaseEndsAt as Date)
    if (toWaiting.kind !== "advanced") throw new Error("expected the break to advance")
    expect(toWaiting.room).toMatchObject({ phase: "waiting", phaseEndsAt: null })
    expect(toWaiting.transitionAt).toBeNull()

    const idle = await advanceExpiredRoom(created.id, toWaiting.room.sequence, roomDb(), new Date("2026-07-16T12:00:00Z"))
    expect(idle.kind).toBe("stale")

    const restarted = await applyHostRoomAction(created.slug, host.id, "start_focus", roomDb())
    expect(restarted.room.phase).toBe("focus")
  })

  it("closing ends memberships and blocks further actions; host leave closes the room", async () => {
    const host = await seedRoomUser("close-host@example.com", "Host")
    const member = await seedRoomUser("close-member@example.com", "Member")
    const { room } = await createRoomWithHost(host.id, "closing-room-01", baseSettings, roomDb())
    await joinRoomBySlug(room.slug, member.id, roomDb())

    const closed = await applyHostRoomAction(room.slug, host.id, "close", roomDb())
    expect(closed.room.phase).toBe("closed")
    expect(closed.room.closedAt).not.toBeNull()
    expect(closed.transitionAt).toBeNull()
    expect(await activeMemberships(host.id)).toHaveLength(0)
    expect(await activeMemberships(member.id)).toHaveLength(0)

    const snapshot = await roomSnapshot(room.id, member.id, roomDb())
    expect(snapshot.room.phase).toBe("closed")
    expect(snapshot.members).toEqual([])
    expect(snapshot.messages).toEqual([])
    await expect(applyHostRoomAction(room.slug, host.id, "start_focus", roomDb())).rejects.toThrow("ROOM_CLOSED")

    const { room: second } = await createRoomWithHost(host.id, "leaving-room-01", baseSettings, roomDb())
    await joinRoomBySlug(second.slug, member.id, roomDb())
    const memberLeave = await leaveRoom(second.slug, member.id, roomDb())
    expect(memberLeave).toMatchObject({ closed: false, left: true })
    expect(await activeMemberships(member.id)).toHaveLength(0)

    // Leaving again is a no-op, so callers know not to broadcast anything.
    const repeatLeave = await leaveRoom(second.slug, member.id, roomDb())
    expect(repeatLeave).toMatchObject({ closed: false, left: false })
    expect((await database.select().from(rooms).where(eq(rooms.id, second.id)))[0].phase).toBe("waiting")

    const hostLeave = await leaveRoom(second.slug, host.id, roomDb())
    expect(hostLeave.closed).toBe(true)
    expect(hostLeave.room.phase).toBe("closed")
    expect(await activeMemberships(host.id)).toHaveLength(0)
  })

  it("snapshots expose only safe member fields and mark your own messages", async () => {
    const host = await seedRoomUser("snap-host@example.com", "Hosting Human", "Host Nick")
    const member = await seedRoomUser("snap-member@example.com", "Member Real Name")
    const stranger = await seedRoomUser("snap-stranger@example.com", "Stranger")
    const { room } = await createRoomWithHost(host.id, "snapshot-room-1", baseSettings, roomDb())
    await joinRoomBySlug(room.slug, member.id, roomDb())
    await database.insert(roomMessages).values({ roomId: room.id, userId: host.id, body: "Welcome" })
    await database.insert(roomMessages).values({ roomId: room.id, userId: member.id, body: "Hello" })

    const snapshot = await roomSnapshot(room.id, member.id, roomDb())
    expect(snapshot.you).toEqual({ role: "member" })
    expect(snapshot.members.map((row) => [row.name, row.role])).toEqual([["Host Nick", "host"], ["Member Real Name", "member"]])
    expect(Object.keys(snapshot.members[0]).sort()).toEqual(["avatarIndex", "id", "joinedAt", "name", "role"])
    expect(Object.keys(snapshot.messages[0]).sort()).toEqual(["authorName", "body", "createdAt", "deleted", "id", "mine", "reactions"])
    expect(snapshot.messages.map((row) => [row.authorName, row.mine])).toEqual([["Host Nick", false], ["Member Real Name", true]])
    expect(snapshot.messages.every((row) => Array.isArray(row.reactions))).toBe(true)
    expect(JSON.stringify(snapshot)).not.toContain("@example.com")
    expect(JSON.stringify(snapshot)).not.toContain(host.id)

    await expect(roomSnapshot(room.id, stranger.id, roomDb())).rejects.toThrow("ROOM_MEMBERSHIP_REQUIRED")
  })

  it("keeps unlisted rooms out of the public list while direct slugs resolve", async () => {
    const publicHost = await seedRoomUser("public-host@example.com", "Public Host")
    const unlistedHost = await seedRoomUser("unlisted-host@example.com", "Unlisted Host")
    const member = await seedRoomUser("lookup-member@example.com", "Member")
    const banned = await seedRoomUser("banned-member@example.com", "Banned")
    await createRoomWithHost(publicHost.id, "public-room-001", baseSettings, roomDb())
    const { room: unlisted } = await createRoomWithHost(unlistedHost.id, "unlisted-room-01", { ...baseSettings, visibility: "unlisted" }, roomDb())
    await database.insert(roomBans).values({ roomId: unlisted.id, userId: banned.id, bannedByUserId: unlistedHost.id })

    const listed = await listPublicRooms(roomDb())
    expect(listed.map((row) => row.room.slug)).toEqual(["public-room-001"])

    expect(await lookupRoomBySlug("missing-room-slug", null, roomDb())).toEqual({ status: "not_found" })
    expect(await lookupRoomBySlug(unlisted.slug, null, roomDb())).toMatchObject({ status: "joinable", name: "Deep Work", memberCount: 1 })
    expect(await lookupRoomBySlug(unlisted.slug, banned.id, roomDb())).toEqual({ status: "banned", name: "Deep Work" })
    await expect(joinRoomBySlug(unlisted.slug, banned.id, roomDb())).rejects.toThrow("ROOM_BANNED")

    await joinRoomBySlug(unlisted.slug, member.id, roomDb())
    expect(await lookupRoomBySlug(unlisted.slug, member.id, roomDb())).toMatchObject({ status: "member", memberCount: 2 })

    await applyHostRoomAction(unlisted.slug, unlistedHost.id, "start_focus", roomDb())
    expect(await lookupRoomBySlug(unlisted.slug, null, roomDb())).toMatchObject({ status: "locked" })
    const outsider = await seedRoomUser("outsider@example.com", "Outsider")
    await expect(joinRoomBySlug(unlisted.slug, outsider.id, roomDb())).rejects.toThrow("ROOM_LOCKED")

    await applyHostRoomAction(unlisted.slug, unlistedHost.id, "close", roomDb())
    expect(await lookupRoomBySlug(unlisted.slug, null, roomDb())).toEqual({ status: "closed", name: "Deep Work" })
    await expect(joinRoomBySlug(unlisted.slug, outsider.id, roomDb())).rejects.toThrow("ROOM_CLOSED")
  })

  it("keeps one active room per user across joining and hosting", async () => {
    const hostA = await seedRoomUser("host-a@example.com", "Host A")
    const hostB = await seedRoomUser("host-b@example.com", "Host B")
    const member = await seedRoomUser("mover@example.com", "Mover")
    const { room: roomA } = await createRoomWithHost(hostA.id, "one-room-a-0001", baseSettings, roomDb())
    const { room: roomB } = await createRoomWithHost(hostB.id, "one-room-b-0001", baseSettings, roomDb())

    await joinRoomBySlug(roomA.slug, member.id, roomDb())
    await joinRoomBySlug(roomB.slug, member.id, roomDb())
    const memberships = await activeMemberships(member.id)
    expect(memberships).toHaveLength(1)
    expect(memberships[0].roomId).toBe(roomB.id)

    // A host joining elsewhere abandons their own room, which closes it.
    const hostAJoin = await joinRoomBySlug(roomB.slug, hostA.id, roomDb())
    expect(hostAJoin.closedRoomIds).toEqual([roomA.id])
    expect((await database.select().from(rooms).where(eq(rooms.id, roomA.id)))[0].phase).toBe("closed")
    expect((await activeMemberships(hostA.id))[0]).toMatchObject({ roomId: roomB.id, role: "member" })

    // Hosting a new room closes the room the user previously hosted.
    const { closedRoomIds } = await createRoomWithHost(hostB.id, "one-room-c-0001", baseSettings, roomDb())
    expect(closedRoomIds).toEqual([roomB.id])
    expect((await database.select().from(rooms).where(eq(rooms.id, roomB.id)))[0].phase).toBe("closed")
    expect(await activeMemberships(member.id)).toHaveLength(0)
  })
})

describe("room moderation", () => {
  const roomDb = () => database as unknown as PomoderDb
  const baseSettings = { name: "Deep Work", visibility: "public" as const, focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, autoStart: false }

  async function seedUser(email: string, name: string, role: "user" | "admin" = "user") {
    const [user] = await database.insert(users).values({ email, name, role, passwordHash: "hash" }).returning()
    return user
  }

  async function seedModeratedRoom(slug: string) {
    const host = await seedUser(`${slug}-host@example.com`, "Host")
    const member = await seedUser(`${slug}-member@example.com`, "Member")
    const { room } = await createRoomWithHost(host.id, slug, baseSettings, roomDb())
    await joinRoomBySlug(room.slug, member.id, roomDb())
    const [hostMessage] = await database.insert(roomMessages).values({ roomId: room.id, userId: host.id, body: "Host message" }).returning()
    const [memberMessage] = await database.insert(roomMessages).values({ roomId: room.id, userId: member.id, body: "Member message" }).returning()
    return { host, member, room, hostMessage, memberMessage }
  }

  async function membershipOf(roomId: string, userId: string) {
    const rows = await database.select().from(roomMemberships).where(and(eq(roomMemberships.roomId, roomId), eq(roomMemberships.userId, userId)))
    return rows.sort((a, b) => b.joinedAt.getTime() - a.joinedAt.getTime())[0]
  }

  async function activeMemberships(userId: string) {
    return database.select().from(roomMemberships).where(and(eq(roomMemberships.userId, userId), isNull(roomMemberships.leftAt)))
  }

  async function auditActions() {
    const rows = await database.select().from(adminAuditLogs)
    return rows.map((row) => row.action)
  }

  it("only lets active members report someone else's message in an open room", async () => {
    const { host, member, room, hostMessage, memberMessage } = await seedModeratedRoom("report-room-0001")
    const stranger = await seedUser("report-stranger@example.com", "Stranger")

    await expect(reportRoomMessage(room.slug, stranger.id, hostMessage.id, "abusive", roomDb())).rejects.toThrow("ROOM_MEMBERSHIP_REQUIRED")
    await expect(reportRoomMessage(room.slug, member.id, memberMessage.id, "self report", roomDb())).rejects.toThrow("CANNOT_REPORT_OWN_MESSAGE")
    await expect(reportRoomMessage("missing-room-slug", member.id, hostMessage.id, "abusive", roomDb())).rejects.toThrow("ROOM_NOT_FOUND")

    // A message from another room cannot be reported through this room.
    const { hostMessage: foreignMessage } = await seedModeratedRoom("report-room-0002")
    await expect(reportRoomMessage(room.slug, member.id, foreignMessage.id, "abusive", roomDb())).rejects.toThrow("MESSAGE_NOT_FOUND")

    expect(await reportRoomMessage(room.slug, member.id, hostMessage.id, "Harassing me in chat", roomDb())).toEqual({ reported: true })
    // Repeat reports of the same message collapse into the original.
    expect(await reportRoomMessage(room.slug, member.id, hostMessage.id, "Harassing me again", roomDb())).toEqual({ reported: false })
    const reports = await database.select().from(roomReports)
    expect(reports).toHaveLength(1)
    expect(reports[0]).toMatchObject({ roomId: room.id, reporterUserId: member.id, messageId: hostMessage.id, reason: "Harassing me in chat", status: "pending", reviewedByUserId: null, reviewedAt: null })

    await applyHostRoomAction(room.slug, host.id, "close", roomDb())
    await expect(reportRoomMessage(room.slug, member.id, hostMessage.id, "abusive", roomDb())).rejects.toThrow("ROOM_CLOSED")
  })

  it("caps report floods per reporter without writing extra rows", async () => {
    const { host, member, room } = await seedModeratedRoom("report-room-0003")
    const bodies = ["one", "two", "three", "four", "five", "six"]
    const messages = await database.insert(roomMessages).values(bodies.map((body) => ({ roomId: room.id, userId: host.id, body }))).returning()

    for (const message of messages.slice(0, 5)) {
      expect(await reportRoomMessage(room.slug, member.id, message.id, "spamming the chat", roomDb())).toEqual({ reported: true })
    }
    await expect(reportRoomMessage(room.slug, member.id, messages[5].id, "spamming the chat", roomDb())).rejects.toThrow("RATE_LIMITED")
    expect(await database.select().from(roomReports)).toHaveLength(5)
  })

  it("locks moderation to the host and never allows self-targets", async () => {
    const { host, member, room, hostMessage } = await seedModeratedRoom("moderate-room-01")
    const hostMembership = await membershipOf(room.id, host.id)
    const memberMembership = await membershipOf(room.id, member.id)

    await expect(deleteRoomMessage(room.slug, member.id, hostMessage.id, roomDb())).rejects.toThrow("ROOM_HOST_REQUIRED")
    await expect(removeRoomMember(room.slug, member.id, hostMembership.id, roomDb())).rejects.toThrow("ROOM_HOST_REQUIRED")
    await expect(banRoomMember(room.slug, member.id, hostMembership.id, roomDb())).rejects.toThrow("ROOM_HOST_REQUIRED")

    await expect(removeRoomMember(room.slug, host.id, hostMembership.id, roomDb())).rejects.toThrow("ROOM_SELF_MODERATION")
    await expect(banRoomMember(room.slug, host.id, hostMembership.id, roomDb())).rejects.toThrow("ROOM_SELF_MODERATION")
    await expect(removeRoomMember(room.slug, host.id, "00000000-0000-4000-8000-000000000000", roomDb())).rejects.toThrow("MEMBER_NOT_FOUND")

    // Nothing above changed memberships or produced privileged audit rows.
    expect(await activeMemberships(member.id)).toHaveLength(1)
    expect((await membershipOf(room.id, memberMembership.userId)).leftAt).toBeNull()
    expect(await auditActions()).toEqual([])
  })

  it("soft-deletes messages into tombstones while keeping review evidence", async () => {
    const { host, member, room, memberMessage } = await seedModeratedRoom("moderate-room-02")

    expect(await deleteRoomMessage(room.slug, host.id, memberMessage.id, roomDb())).toMatchObject({ deleted: true })
    // Repeating the delete is a harmless no-op, not an error.
    expect(await deleteRoomMessage(room.slug, host.id, memberMessage.id, roomDb())).toMatchObject({ deleted: false })

    const snapshot = await roomSnapshot(room.id, member.id, roomDb())
    const tombstone = snapshot.messages.find((message) => message.id === memberMessage.id)
    expect(tombstone).toMatchObject({ deleted: true, body: "" })
    expect(JSON.stringify(snapshot)).not.toContain("Member message")

    const [stored] = await database.select().from(roomMessages).where(eq(roomMessages.id, memberMessage.id))
    expect(stored.body).toBe("Member message")
    expect(stored.deletedAt).not.toBeNull()
    expect(await auditActions()).toEqual(["delete_message"])
  })

  it("removal ends the membership but allows rejoining; a ban blocks it", async () => {
    const { host, member, room } = await seedModeratedRoom("moderate-room-03")
    const firstMembership = await membershipOf(room.id, member.id)

    const removal = await removeRoomMember(room.slug, host.id, firstMembership.id, roomDb())
    expect(removal.removed).toBe(true)
    expect(await activeMemberships(member.id)).toHaveLength(0)
    await joinRoomBySlug(room.slug, member.id, roomDb())
    expect(await activeMemberships(member.id)).toHaveLength(1)

    const rejoinedMembership = await membershipOf(room.id, member.id)
    await banRoomMember(room.slug, host.id, rejoinedMembership.id, roomDb())
    expect(await activeMemberships(member.id)).toHaveLength(0)
    expect(await database.select().from(roomBans).where(eq(roomBans.userId, member.id))).toHaveLength(1)
    await expect(joinRoomBySlug(room.slug, member.id, roomDb())).rejects.toThrow("ROOM_BANNED")
    expect(await lookupRoomBySlug(room.slug, member.id, roomDb())).toEqual({ status: "banned", name: "Deep Work" })

    // Banning again through a stale membership id stays idempotent.
    await banRoomMember(room.slug, host.id, firstMembership.id, roomDb())
    expect(await database.select().from(roomBans).where(eq(roomBans.userId, member.id))).toHaveLength(1)
    expect(await auditActions()).toEqual(["remove_member", "ban_member", "ban_member"])
  })

  it("keeps the banned state consistent when a ban races a rejoin", async () => {
    const { host, member, room } = await seedModeratedRoom("moderate-room-04")
    await leaveRoom(room.slug, member.id, roomDb())
    const staleMembership = await membershipOf(room.id, member.id)

    const [banResult, joinResult] = await Promise.allSettled([
      banRoomMember(room.slug, host.id, staleMembership.id, roomDb()),
      joinRoomBySlug(room.slug, member.id, roomDb()),
    ])
    expect(banResult.status).toBe("fulfilled")
    // Whichever side won the race, the member ends up banned and outside.
    if (joinResult.status === "rejected") expect(String(joinResult.reason)).toContain("ROOM_BANNED")
    expect(await activeMemberships(member.id)).toHaveLength(0)
    expect(await database.select().from(roomBans).where(eq(roomBans.userId, member.id))).toHaveLength(1)
    await expect(joinRoomBySlug(room.slug, member.id, roomDb())).rejects.toThrow("ROOM_BANNED")
  })

  it("records reviewer, timestamp, decision, and audit entries for admin review", async () => {
    const { member, room, hostMessage } = await seedModeratedRoom("review-room-0001")
    const admin = await seedUser("review-admin@example.com", "Admin", "admin")
    await reportRoomMessage(room.slug, member.id, hostMessage.id, "Harassment", roomDb())
    const [report] = await database.select().from(roomReports)

    await applyPomoderAdminAction(admin.id, { type: "review_report", id: report.id, decision: "resolved" }, roomDb())
    let [reviewed] = await database.select().from(roomReports)
    expect(reviewed).toMatchObject({ status: "resolved", reviewedByUserId: admin.id })
    expect(reviewed.reviewedAt).not.toBeNull()

    await applyPomoderAdminAction(admin.id, { type: "review_report", id: report.id, decision: "dismissed" }, roomDb())
    ;[reviewed] = await database.select().from(roomReports)
    expect(reviewed.status).toBe("dismissed")

    // Reopening returns the report to the pending queue with no reviewer.
    await applyPomoderAdminAction(admin.id, { type: "review_report", id: report.id, decision: "pending" }, roomDb())
    ;[reviewed] = await database.select().from(roomReports)
    expect(reviewed).toMatchObject({ status: "pending", reviewedByUserId: null, reviewedAt: null })

    await expect(applyPomoderAdminAction(admin.id, { type: "review_report", id: "00000000-0000-4000-8000-000000000000", decision: "resolved" }, roomDb())).rejects.toThrow("RECORD_NOT_FOUND")
    expect(await auditActions()).toEqual(["resolve_report", "dismiss_report", "reopen_report"])
  })

  it("filters admin reports by status and keeps sanitized context after deletion", async () => {
    const { host, member, room, hostMessage, memberMessage } = await seedModeratedRoom("review-room-0002")
    const admin = await seedUser("filter-admin@example.com", "Admin", "admin")
    await reportRoomMessage(room.slug, member.id, hostMessage.id, "Harassment", roomDb())
    await reportRoomMessage(room.slug, host.id, memberMessage.id, "Spam", roomDb())
    const spamReport = (await database.select().from(roomReports)).find((row) => row.reason === "Spam")
    await applyPomoderAdminAction(admin.id, { type: "review_report", id: spamReport!.id, decision: "resolved" }, roomDb())
    // Soft-deleting the reported message must not erase the admin context.
    await deleteRoomMessage(room.slug, host.id, hostMessage.id, roomDb())

    const load = { page: 1, pageSize: 25, sortColumn: 0, sortDirection: "asc", section: "reports" } as const
    const pending = await loadPomoderAdminData({ ...load, reportStatus: "pending" }, roomDb())
    expect(pending.pagination.total).toBe(1)
    expect(pending.reports).toHaveLength(1)
    expect(pending.reports[0]).toMatchObject({
      roomName: "Deep Work",
      reporterEmail: "review-room-0002-member@example.com",
      messageBody: "Host message",
      messageAuthorEmail: "review-room-0002-host@example.com",
      reviewerEmail: null,
    })
    expect(pending.reports[0].messageDeletedAt).not.toBeNull()

    const resolved = await loadPomoderAdminData({ ...load, reportStatus: "resolved" }, roomDb())
    expect(resolved.pagination.total).toBe(1)
    expect(resolved.reports[0]).toMatchObject({ messageBody: "Member message", reviewerEmail: "filter-admin@example.com" })

    const all = await loadPomoderAdminData({ ...load, reportStatus: "all" }, roomDb())
    expect(all.pagination.total).toBe(2)
  })

  const reactionsFor = (snapshot: Awaited<ReturnType<typeof roomSnapshot>>, messageId: string) =>
    snapshot.messages.find((message) => message.id === messageId)?.reactions ?? []

  it("tallies reactions per person, toggles them off, and keeps the palette order", async () => {
    const { host, member, room, hostMessage, memberMessage } = await seedModeratedRoom("reaction-room-01")
    const stranger = await seedUser("reaction-stranger@example.com", "Stranger")

    expect(await toggleRoomReaction(room.slug, host.id, memberMessage.id, "🔥", roomDb())).toMatchObject({ added: true })
    expect(await toggleRoomReaction(room.slug, member.id, memberMessage.id, "🔥", roomDb())).toMatchObject({ added: true })

    // Both people see the same total; each sees their own reaction flagged.
    expect(reactionsFor(await roomSnapshot(room.id, member.id, roomDb()), memberMessage.id)).toEqual([{ emoji: "🔥", count: 2, mine: true }])
    expect(reactionsFor(await roomSnapshot(room.id, host.id, roomDb()), memberMessage.id)).toEqual([{ emoji: "🔥", count: 2, mine: true }])

    // Toggling off removes only your own reaction; the other person's remains.
    expect(await toggleRoomReaction(room.slug, host.id, memberMessage.id, "🔥", roomDb())).toMatchObject({ added: false })
    expect(reactionsFor(await roomSnapshot(room.id, host.id, roomDb()), memberMessage.id)).toEqual([{ emoji: "🔥", count: 1, mine: false }])
    expect(reactionsFor(await roomSnapshot(room.id, member.id, roomDb()), memberMessage.id)).toEqual([{ emoji: "🔥", count: 1, mine: true }])

    // A second emoji sorts into the fixed palette order (thumbs up before fire).
    await toggleRoomReaction(room.slug, member.id, memberMessage.id, "👍", roomDb())
    expect(reactionsFor(await roomSnapshot(room.id, member.id, roomDb()), memberMessage.id)).toEqual([
      { emoji: "👍", count: 1, mine: true },
      { emoji: "🔥", count: 1, mine: true },
    ])

    // Only the palette is accepted, and only for a real message in this room.
    await expect(toggleRoomReaction(room.slug, member.id, memberMessage.id, "🎉", roomDb())).rejects.toThrow("INVALID_REACTION")
    await expect(toggleRoomReaction(room.slug, stranger.id, memberMessage.id, "🔥", roomDb())).rejects.toThrow("ROOM_MEMBERSHIP_REQUIRED")
    const { memberMessage: foreignMessage } = await seedModeratedRoom("reaction-room-02")
    await expect(toggleRoomReaction(room.slug, member.id, foreignMessage.id, "🔥", roomDb())).rejects.toThrow("MESSAGE_NOT_FOUND")

    // A deleted message drops its reactions and refuses new ones.
    await deleteRoomMessage(room.slug, host.id, memberMessage.id, roomDb())
    expect(reactionsFor(await roomSnapshot(room.id, member.id, roomDb()), memberMessage.id)).toEqual([])
    await expect(toggleRoomReaction(room.slug, member.id, memberMessage.id, "🔥", roomDb())).rejects.toThrow("MESSAGE_DELETED")

    // The host's own message is unaffected.
    await toggleRoomReaction(room.slug, host.id, hostMessage.id, "❤️", roomDb())
    expect(reactionsFor(await roomSnapshot(room.id, host.id, roomDb()), hostMessage.id)).toEqual([{ emoji: "❤️", count: 1, mine: true }])
  })

  it("drops reactions from members who are removed or banned, and restores them on rejoin", async () => {
    const { host, member, room, hostMessage } = await seedModeratedRoom("reaction-room-03")

    await toggleRoomReaction(room.slug, host.id, hostMessage.id, "🔥", roomDb())
    await toggleRoomReaction(room.slug, member.id, hostMessage.id, "🔥", roomDb())
    expect(reactionsFor(await roomSnapshot(room.id, host.id, roomDb()), hostMessage.id)).toEqual([{ emoji: "🔥", count: 2, mine: true }])

    // Removing the member hides their reaction without deleting the row.
    const membership = await membershipOf(room.id, member.id)
    await removeRoomMember(room.slug, host.id, membership.id, roomDb())
    expect(reactionsFor(await roomSnapshot(room.id, host.id, roomDb()), hostMessage.id)).toEqual([{ emoji: "🔥", count: 1, mine: true }])
    expect(await database.select().from(roomMessageReactions)).toHaveLength(2)

    // Rejoining restores it: the reaction belongs to an active member again.
    await joinRoomBySlug(room.slug, member.id, roomDb())
    expect(reactionsFor(await roomSnapshot(room.id, host.id, roomDb()), hostMessage.id)).toEqual([{ emoji: "🔥", count: 2, mine: true }])

    // A ban ends the membership for good, so their reaction stays gone.
    const rejoined = await membershipOf(room.id, member.id)
    await banRoomMember(room.slug, host.id, rejoined.id, roomDb())
    expect(reactionsFor(await roomSnapshot(room.id, host.id, roomDb()), hostMessage.id)).toEqual([{ emoji: "🔥", count: 1, mine: true }])
  })

  it("rate-limits reaction spam per person like chat", async () => {
    const { member, room, hostMessage } = await seedModeratedRoom("reaction-room-04")
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await toggleRoomReaction(room.slug, member.id, hostMessage.id, "🔥", roomDb())
    }
    await expect(toggleRoomReaction(room.slug, member.id, hostMessage.id, "🔥", roomDb())).rejects.toThrow("RATE_LIMITED")
  })
})
