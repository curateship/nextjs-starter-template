import { PGlite } from "@electric-sql/pglite"
import { and, eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { type CustomShellDb } from "@/server/db"
import {
  focusSessions,
  pomodoroBlocks,
  pomodoroProfiles,
  roomMemberships,
  tasks,
} from "@/server/pomodoro/schema"
import {
  createRoomWithHost,
  joinRoomBySlug,
  leaveRoom,
  readFocusedWith,
  roomSnapshot,
  type RoomSettings,
} from "@/server/pomodoro/rooms"
import { createTestDatabase, insertUser } from "@/server/test-support"

/**
 * Rooms task 01, parts 2 to 4, against a real database: the task beside a
 * name, the one-room-at-a-time rule, and who you have focused with.
 */

const SETTINGS: RoomSettings = {
  name: "Tuesday writing",
  visibility: "unlisted",
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  autoStart: false,
  sound: "curated:rain",
  background: "scene:plain",
}
const HOUR = 3_600_000

let client: PGlite
let db: CustomShellDb
let hostId: string
let memberId: string

beforeEach(async () => {
  ;({ client, db } = await createTestDatabase())
  hostId = (await insertUser(db, { name: "Sam Host" })).id
  memberId = (await insertUser(db, { name: "Alex Member" })).id
})

afterEach(async () => {
  await client.close()
})

async function openRoom(at = new Date()) {
  const slug = `slug-${Math.random().toString(36).slice(2, 12)}pad`
  const { room } = await createRoomWithHost(hostId, slug, SETTINGS, db, at)
  return room
}

async function profile(userId: string, values: Partial<typeof pomodoroProfiles.$inferInsert>) {
  await db
    .insert(pomodoroProfiles)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: pomodoroProfiles.userId, set: values })
}

async function startFocusOn(userId: string, title: string) {
  const [task] = await db
    .insert(tasks)
    .values({ userId, title, plannedDate: "2099-01-01" })
    .returning()
  await db.insert(focusSessions).values({
    userId,
    taskId: task.id,
    mode: "focus",
    status: "running",
    plannedSeconds: 1500,
    targetEndsAt: new Date(Date.now() + 25 * 60_000),
    idempotencyKey: `key-${task.id}`,
  })
}

describe("the task beside a name", () => {
  it("is hidden while the switch is off, which is the default", async () => {
    const room = await openRoom()
    await joinRoomBySlug(room.slug, memberId, db)
    await startFocusOn(memberId, "Invoice for Acme")
    const snapshot = await roomSnapshot(room.id, hostId, db)
    expect(snapshot.members.map((member) => member.task)).toEqual([null, null])
  })

  it("shows that person's running focus task only, and goes on the next snapshot when switched off", async () => {
    const room = await openRoom()
    await joinRoomBySlug(room.slug, memberId, db)
    await startFocusOn(memberId, "Chapter three")
    await startFocusOn(hostId, "Host's own task")
    await profile(memberId, { shareTaskInRooms: true })

    const shown = await roomSnapshot(room.id, hostId, db)
    const byName = Object.fromEntries(shown.members.map((member) => [member.name, member.task]))
    expect(byName).toEqual({ "Sam Host": null, "Alex Member": "Chapter three" })

    await profile(memberId, { shareTaskInRooms: false })
    const hidden = await roomSnapshot(room.id, hostId, db)
    expect(hidden.members.every((member) => member.task === null)).toBe(true)
  })

  it("says nothing once the focus has finished, is paused, or has run past its end", async () => {
    const room = await openRoom()
    await joinRoomBySlug(room.slug, memberId, db)
    await profile(memberId, { shareTaskInRooms: true })
    await startFocusOn(memberId, "Chapter three")
    const taskShown = async () =>
      (await roomSnapshot(room.id, hostId, db)).members.find((member) => member.name === "Alex Member")?.task
    expect(await taskShown()).toBe("Chapter three")

    await db.update(focusSessions).set({ status: "paused" }).where(eq(focusSessions.userId, memberId))
    expect(await taskShown()).toBeNull()

    await db.update(focusSessions).set({ status: "running", targetEndsAt: new Date(Date.now() - 1_000) }).where(eq(focusSessions.userId, memberId))
    expect(await taskShown()).toBeNull()

    await db.update(focusSessions).set({ status: "completed" }).where(eq(focusSessions.userId, memberId))
    expect(await taskShown()).toBeNull()
  })

  it("follows the newest focus, so a newer one with no task picked shows nothing", async () => {
    const room = await openRoom()
    await joinRoomBySlug(room.slug, memberId, db)
    await profile(memberId, { shareTaskInRooms: true })
    await startFocusOn(memberId, "Old task")
    await db.insert(focusSessions).values({
      userId: memberId,
      mode: "focus",
      status: "running",
      plannedSeconds: 1500,
      targetEndsAt: new Date(Date.now() + 25 * 60_000),
      idempotencyKey: "no-task",
      createdAt: new Date(Date.now() + 1_000),
    })
    const snapshot = await roomSnapshot(room.id, hostId, db)
    expect(snapshot.members.every((member) => member.task === null)).toBe(true)
  })
})

describe("one room at a time", () => {
  it("joining a second room leaves the first", async () => {
    const first = await openRoom()
    await joinRoomBySlug(first.slug, memberId, db)
    const otherHost = await insertUser(db)
    const { room: second } = await createRoomWithHost(otherHost.id, "second-room-slug-pad", SETTINGS, db)
    await joinRoomBySlug(second.slug, memberId, db)
    const active = await db
      .select()
      .from(roomMemberships)
      .where(and(eq(roomMemberships.userId, memberId)))
    expect(active.filter((row) => row.leftAt === null)).toHaveLength(1)
  })
})

describe("focused with", () => {
  async function shareTwoHours() {
    const start = new Date(Date.now() - 3 * HOUR)
    const room = await openRoom(start)
    await joinRoomBySlug(room.slug, memberId, db, start)
    await leaveRoom(room.slug, memberId, db, new Date(start.getTime() + 2 * HOUR))
    return room
  }

  it("gives both people the other's name and two hours", async () => {
    await profile(hostId, { leaderboardOptIn: true, publicDisplayName: "Sam" })
    await profile(memberId, { leaderboardOptIn: true, publicDisplayName: "Alex" })
    await shareTwoHours()
    expect(await readFocusedWith(hostId, db)).toEqual({ optedIn: true, people: [{ name: "Alex", seconds: 7200 }] })
    expect(await readFocusedWith(memberId, db)).toEqual({ optedIn: true, people: [{ name: "Sam", seconds: 7200 }] })
  })

  it("leaves out somebody across a block, on both sides", async () => {
    await profile(hostId, { leaderboardOptIn: true, publicDisplayName: "Sam" })
    await profile(memberId, { leaderboardOptIn: true, publicDisplayName: "Alex" })
    await shareTwoHours()
    await db.insert(pomodoroBlocks).values({ blockerUserId: memberId, blockedUserId: hostId })
    expect(await readFocusedWith(hostId, db)).toEqual({ optedIn: true, people: [] })
    expect(await readFocusedWith(memberId, db)).toEqual({ optedIn: true, people: [] })
  })

  it("names nobody who has not opted in, and shows them nobody", async () => {
    await profile(hostId, { leaderboardOptIn: true, publicDisplayName: "Sam" })
    await profile(memberId, { leaderboardOptIn: false, publicDisplayName: "Alex" })
    await shareTwoHours()
    expect(await readFocusedWith(hostId, db)).toEqual({ optedIn: true, people: [] })
    expect(await readFocusedWith(memberId, db)).toEqual({ optedIn: false, people: [] })
  })
})
