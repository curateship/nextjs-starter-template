import { PGlite } from "@electric-sql/pglite"
import { and, eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/server/auth/origin", () => ({ requestIp: () => "203.0.113.7" }))

import { type CustomShellDb } from "@/server/db"
import {
  clearAdminFocusData,
  deleteAdminReports,
  deleteAdminRoomRepeats,
  deleteAdminRooms,
  deleteAdminSessions,
  deleteAdminTasks,
  previewRoomDeletion,
} from "@/server/pomodoro/admin-deletes"
import { reportProfile } from "@/server/pomodoro/profile-reports"
import {
  createRoomWithHost,
  joinRoomBySlug,
  postRoomMessage,
  reportRoomMessage,
} from "@/server/pomodoro/rooms"
import {
  dailyFocusStats,
  focusSessions,
  pomodoroAuditLogs,
  pomodoroNoticeLinks,
  pomodoroProfiles,
  pomodoroRoomRepeats,
  roomMessages,
  roomReports,
  rooms,
  tasks,
} from "@/server/pomodoro/schema"
import { customShellNotifications } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

/**
 * The admin deletes, against a real database: what each takes with it, what
 * it puts back right in the member's totals, and the one log row per press.
 */

let client: PGlite
let db: CustomShellDb

beforeEach(async () => {
  ;({ client, db } = await createTestDatabase())
})

afterEach(async () => {
  await client.close()
})

async function person(name: string, role = "member", timezone = "UTC") {
  const user = await insertUser(db, { name, role })
  await db.insert(pomodoroProfiles).values({
    userId: user.id,
    publicDisplayName: name,
    handle: name.toLowerCase(),
    profilePublic: true,
    timezone,
  })
  return user.id
}

async function session(
  userId: string,
  values: Partial<typeof focusSessions.$inferInsert> = {}
) {
  const [row] = await db
    .insert(focusSessions)
    .values({
      userId,
      mode: "focus",
      status: "completed",
      plannedSeconds: 1500,
      accumulatedSeconds: 1500,
      completedAt: new Date("2026-10-07T12:00:00Z"),
      idempotencyKey: crypto.randomUUID(),
      ...values,
    })
    .returning()
  return row
}

async function day(userId: string, localDate: string) {
  const [row] = await db
    .select()
    .from(dailyFocusStats)
    .where(
      and(
        eq(dailyFocusStats.userId, userId),
        eq(dailyFocusStats.localDate, localDate)
      )
    )
  return row
}

async function logRows() {
  return db.select().from(pomodoroAuditLogs)
}

const ROOM = {
  visibility: "public" as const,
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  autoStart: false,
  sound: "curated:rain",
  background: "scene:plain",
}

describe("deleting focus sessions", () => {
  it("takes a finished focus back off the day it counted on, in the member's own timezone", async () => {
    const admin = await person("Ada", "admin")
    // 02:00 UTC on 8 Oct is still 7 Oct in Los Angeles, so that is the row.
    const sam = await person("Sam", "member", "America/Los_Angeles")
    const [task] = await db
      .insert(tasks)
      .values({ userId: sam, title: "Write", plannedDate: "2026-10-07", pomodoroCount: 2 })
      .returning()
    await db.insert(dailyFocusStats).values([
      { userId: sam, localDate: "2026-10-07", focusSessions: 2, focusSeconds: 3000 },
    ])
    const run = await session(sam, {
      taskId: task.id,
      completedAt: new Date("2026-10-08T02:00:00Z"),
    })

    const result = await deleteAdminSessions({ sessionIds: [run.id], actorUserId: admin })

    expect(result).toEqual({ deleted: [run.id], skipped: [] })
    expect(await day(sam, "2026-10-07")).toMatchObject({
      localDate: "2026-10-07",
      focusSessions: 1,
      focusSeconds: 1500,
    })
    const [after] = await db.select().from(tasks).where(eq(tasks.id, task.id))
    expect(after.pomodoroCount).toBe(1)
    expect(await logRows()).toMatchObject([
      { actorUserId: admin, action: "delete_sessions", resource: "sessions", recordIds: [run.id] },
    ])
  })

  it("never takes a day below zero, so an imported day stays sane", async () => {
    const admin = await person("Ada", "admin")
    const sam = await person("Sam")
    await db
      .insert(dailyFocusStats)
      .values({ userId: sam, localDate: "2026-10-07", focusSessions: 0, focusSeconds: 600 })
    const run = await session(sam)

    await deleteAdminSessions({ sessionIds: [run.id], actorUserId: admin })

    expect(await day(sam, "2026-10-07")).toMatchObject({ focusSessions: 0, focusSeconds: 0 })
  })

  it("leaves a running timer and a break's day alone", async () => {
    const admin = await person("Ada", "admin")
    const sam = await person("Sam")
    await db
      .insert(dailyFocusStats)
      .values({ userId: sam, localDate: "2026-10-07", focusSessions: 1, focusSeconds: 1500 })
    const live = await session(sam, { status: "running", completedAt: null })
    const pause = await session(sam, { mode: "short", accumulatedSeconds: 300 })

    const result = await deleteAdminSessions({
      sessionIds: [live.id, pause.id],
      actorUserId: admin,
    })

    expect(result).toEqual({ deleted: [pause.id], skipped: [live.id] })
    expect(await day(sam, "2026-10-07")).toMatchObject({ focusSessions: 1, focusSeconds: 1500 })
  })

  it("writes no log row when nothing went", async () => {
    const admin = await person("Ada", "admin")
    const result = await deleteAdminSessions({
      sessionIds: [crypto.randomUUID()],
      actorUserId: admin,
    })
    expect(result.deleted).toEqual([])
    expect(await logRows()).toEqual([])
  })
})

describe("deleting tasks", () => {
  it("takes a ticked task off its day and clears a pointer to a deleted copy", async () => {
    const admin = await person("Ada", "admin")
    const sam = await person("Sam")
    const [copy] = await db
      .insert(tasks)
      .values({
        userId: sam,
        title: "Write",
        plannedDate: "2026-10-07",
        status: "completed",
        completedAt: new Date("2026-10-07T09:00:00Z"),
      })
      .returning()
    const [original] = await db
      .insert(tasks)
      .values({
        userId: sam,
        title: "Write",
        plannedDate: "2026-10-06",
        status: "carried",
        carriedToTaskId: copy.id,
      })
      .returning()
    await db
      .insert(dailyFocusStats)
      .values({ userId: sam, localDate: "2026-10-07", tasksCompleted: 1 })

    await deleteAdminTasks({ taskIds: [copy.id], actorUserId: admin })

    const [left] = await db.select().from(tasks)
    expect(left).toMatchObject({ id: original.id, carriedToTaskId: null })
    expect(await day(sam, "2026-10-07")).toMatchObject({ tasksCompleted: 0 })
    expect((await logRows())[0]).toMatchObject({ action: "delete_tasks", recordIds: [copy.id] })
  })
})

describe("deleting rooms", () => {
  it("takes the chat and the reports with it, counts them first, and clears the admins' report notice", async () => {
    const admin = await person("Ada", "admin")
    const [host, sam] = [await person("Host"), await person("Sam")]
    const { room } = await createRoomWithHost(host, "deep-work", { name: "Deep Work", ...ROOM }, db)
    await joinRoomBySlug(room.slug, sam, db)
    await postRoomMessage(room.slug, sam, "something rude", db)
    const [line] = await db.select({ id: roomMessages.id }).from(roomMessages)
    await reportRoomMessage(room.slug, host, line.id, "rude", db)

    expect(await previewRoomDeletion([room.id])).toEqual({
      messages: 1,
      reports: 1,
      inRoom: 2,
    })

    const result = await deleteAdminRooms({ roomIds: [room.id], actorUserId: admin })

    expect(result).toEqual({ deleted: [room.id], skipped: [] })
    expect(await db.select().from(rooms)).toEqual([])
    expect(await db.select().from(roomMessages)).toEqual([])
    expect(await db.select().from(roomReports)).toEqual([])
    const [notice] = await db
      .select({ readAt: customShellNotifications.readAt })
      .from(customShellNotifications)
      .innerJoin(pomodoroNoticeLinks, eq(pomodoroNoticeLinks.noticeId, customShellNotifications.id))
      .where(eq(pomodoroNoticeLinks.kind, "report_new"))
    expect(notice.readAt).not.toBeNull()
    expect((await logRows()).map((row) => row.action)).toEqual(["delete_rooms"])
  })

  it("keeps the sessions people ran in the room", async () => {
    const admin = await person("Ada", "admin")
    const host = await person("Host")
    const { room } = await createRoomWithHost(host, "deep-work", { name: "Deep Work", ...ROOM }, db)
    const run = await session(host, { roomId: room.id })

    await deleteAdminRooms({ roomIds: [room.id], actorUserId: admin })

    const [kept] = await db.select().from(focusSessions)
    expect(kept).toMatchObject({ id: run.id, roomId: null })
  })
})

describe("deleting reports", () => {
  it("removes them, tells the reporter nothing, and clears the queue notice", async () => {
    const admin = await person("Ada", "admin")
    const reporter = await person("Kim")
    await person("Sam")
    await reportProfile({ handle: "sam", reason: "words", reporterUserId: reporter })
    const [{ id }] = await db.select({ id: roomReports.id }).from(roomReports)

    await deleteAdminReports({ reportIds: [id], actorUserId: admin })

    expect(await db.select().from(roomReports)).toEqual([])
    const told = await db
      .select()
      .from(customShellNotifications)
      .where(eq(customShellNotifications.recipientUserId, reporter))
    expect(told).toEqual([])
    const [adminNotice] = await db
      .select({ readAt: customShellNotifications.readAt })
      .from(customShellNotifications)
      .where(eq(customShellNotifications.recipientUserId, admin))
    expect(adminNotice.readAt).not.toBeNull()
  })
})

describe("clearing focus data", () => {
  it("wipes finished runs, daily totals and task counts, keeps a live timer, and skips an empty account", async () => {
    const admin = await person("Ada", "admin")
    const [sam, kim] = [await person("Sam"), await person("Kim")]
    await db.insert(tasks).values({
      userId: sam,
      title: "Write",
      plannedDate: "2026-10-07",
      pomodoroCount: 3,
    })
    await db
      .insert(dailyFocusStats)
      .values({ userId: sam, localDate: "2026-10-07", focusSessions: 3, focusSeconds: 4500 })
    await session(sam)
    const live = await session(sam, { status: "running", completedAt: null })

    const result = await clearAdminFocusData({ userIds: [sam, kim], actorUserId: admin })

    expect(result).toEqual({ deleted: [sam], skipped: [kim] })
    expect(await db.select().from(dailyFocusStats)).toEqual([])
    expect((await db.select().from(focusSessions)).map((row) => row.id)).toEqual([live.id])
    const [task] = await db.select().from(tasks)
    expect(task.pomodoroCount).toBe(0)
    expect((await logRows())[0]).toMatchObject({ action: "clear_focus_data", recordIds: [sam] })
  })
})

describe("deleting weekly rooms", () => {
  it("stops the rule and keeps the room it already booked", async () => {
    const admin = await person("Ada", "admin")
    const host = await person("Host")
    const [rule] = await db
      .insert(pomodoroRoomRepeats)
      .values({
        hostUserId: host,
        name: "Mornings",
        weekdays: 2,
        startMinute: 540,
        timezone: "UTC",
      })
      .returning()
    const { room } = await createRoomWithHost(host, "mornings", { name: "Mornings", ...ROOM }, db)
    await db.update(rooms).set({ repeatId: rule.id }).where(eq(rooms.id, room.id))

    await deleteAdminRoomRepeats({ repeatIds: [rule.id], actorUserId: admin })

    expect(await db.select().from(pomodoroRoomRepeats)).toEqual([])
    const [kept] = await db.select().from(rooms)
    expect(kept).toMatchObject({ id: room.id, repeatId: null })
  })
})
