import { PGlite } from "@electric-sql/pglite"
import { and, eq, isNull } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { type CustomShellDb } from "@/server/db"
import {
  cancelAdminInvites,
  closeAdminRooms,
  deleteRoomPresets,
  listRoomPresets,
  saveAdminRoom,
  saveRoomPreset,
  setAdminRoomsFeatured,
} from "@/server/pomodoro/admin-rooms"
import { forgetAppSettings, saveAppSetting } from "@/server/pomodoro/app-settings"
import { createRoomWithHost, joinRoomBySlug, listPublicRooms } from "@/server/pomodoro/rooms"
import { scheduleRoomWithInvites } from "@/server/pomodoro/scheduled-rooms"
import {
  pomodoroNoticeLinks,
  roomInvites,
  roomMemberships,
  rooms,
} from "@/server/pomodoro/schema"
import { customShellNotifications } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

/**
 * Rooms in the admin, against a real database: closing, editing, featuring,
 * invites, house presets and the room limits.
 */

let client: PGlite
let db: CustomShellDb

beforeEach(async () => {
  ;({ client, db } = await createTestDatabase())
  forgetAppSettings()
})

afterEach(async () => {
  await client.close()
})

const SETTINGS = {
  visibility: "public" as const,
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  autoStart: false,
  sound: "curated:rain",
  background: "scene:plain",
}

async function openRoom(hostId: string, slug: string) {
  const { room } = await createRoomWithHost(hostId, slug, { name: slug, ...SETTINGS }, db)
  return room
}

async function noticesFor(userId: string) {
  return db
    .select({ message: customShellNotifications.message, kind: pomodoroNoticeLinks.kind })
    .from(customShellNotifications)
    .innerJoin(pomodoroNoticeLinks, eq(pomodoroNoticeLinks.noticeId, customShellNotifications.id))
    .where(eq(customShellNotifications.recipientUserId, userId))
}

describe("closing rooms", () => {
  it("ends a live room, takes everybody out, keeps it, and tells the host", async () => {
    const admin = (await insertUser(db, { role: "admin" })).id
    const [host, sam] = [(await insertUser(db)).id, (await insertUser(db)).id]
    const room = await openRoom(host, "deep-work")
    await joinRoomBySlug(room.slug, sam, db)

    const result = await closeAdminRooms({ roomIds: [room.id], actorUserId: admin })

    expect(result).toEqual({ closed: [room.id], skipped: [] })
    const [after] = await db.select().from(rooms).where(eq(rooms.id, room.id))
    expect(after).toMatchObject({ phase: "closed" })
    expect(after.closedAt).not.toBeNull()
    const inside = await db
      .select()
      .from(roomMemberships)
      .where(and(eq(roomMemberships.roomId, room.id), isNull(roomMemberships.leftAt)))
    expect(inside).toEqual([])
    expect(await noticesFor(host)).toContainEqual({
      message: "An admin closed your room deep-work.",
      kind: "room_changed",
    })
    // Closing again is skipped, not written twice.
    expect(await closeAdminRooms({ roomIds: [room.id], actorUserId: admin })).toEqual({
      closed: [],
      skipped: [room.id],
    })
  })

  it("cancels a booked room and stops its invitations", async () => {
    const admin = (await insertUser(db, { role: "admin" })).id
    const host = (await insertUser(db)).id
    const booked = await scheduleRoomWithInvites(
      host,
      "later",
      { name: "Later", ...SETTINGS, startsAt: new Date(Date.now() + 3_600_000), invites: ["a@example.com"] },
      db
    )
    await closeAdminRooms({ roomIds: [booked.id], actorUserId: admin })
    const [invite] = await db.select().from(roomInvites)
    expect(invite.status).toBe("cancelled")
  })
})

describe("editing and featuring", () => {
  it("saves the window and tells the host in the bell", async () => {
    const admin = (await insertUser(db, { role: "admin" })).id
    const host = (await insertUser(db)).id
    const room = await openRoom(host, "quiet")
    await saveAdminRoom({
      id: room.id,
      input: { ...SETTINGS, name: "Quiet corner", focusMinutes: 50, featured: true },
      actorUserId: admin,
    })
    const [after] = await db.select().from(rooms).where(eq(rooms.id, room.id))
    expect(after).toMatchObject({ name: "Quiet corner", focusMinutes: 50 })
    expect(after.featuredAt).not.toBeNull()
    expect((await noticesFor(host))[0].message).toBe("An admin changed your room Quiet corner.")
  })

  it("puts featured rooms first on Browse rooms", async () => {
    const admin = (await insertUser(db, { role: "admin" })).id
    const [a, b, viewer] = [(await insertUser(db)).id, (await insertUser(db)).id, (await insertUser(db)).id]
    const older = await openRoom(a, "older")
    await openRoom(b, "newer")
    await setAdminRoomsFeatured({ roomIds: [older.id], featured: true, actorUserId: admin })

    const listed = await listPublicRooms(viewer, db)
    expect(listed.map((row) => [row.room.slug, row.featured])).toEqual([
      ["older", true],
      ["newer", false],
    ])
  })
})

describe("invites and presets", () => {
  it("cancels only invitations still waiting to go out", async () => {
    const admin = (await insertUser(db, { role: "admin" })).id
    const host = (await insertUser(db)).id
    await scheduleRoomWithInvites(
      host,
      "booked",
      { name: "Booked", ...SETTINGS, startsAt: new Date(Date.now() + 3_600_000), invites: ["a@example.com", "b@example.com"] },
      db
    )
    const [first, second] = await db.select().from(roomInvites)
    await db.update(roomInvites).set({ status: "sent" }).where(eq(roomInvites.id, second.id))

    const result = await cancelAdminInvites({ inviteIds: [first.id, second.id], actorUserId: admin })
    expect(result).toEqual({ cancelled: [first.id], skipped: [second.id] })
  })

  it("keeps house presets in the order made, and deletes them", async () => {
    const admin = (await insertUser(db, { role: "admin" })).id
    const preset = { focusMinutes: 50, shortBreakMinutes: 10, longBreakMinutes: 30, autoStart: true, sound: "shuffle", background: null }
    const first = await saveRoomPreset({ id: null, input: { name: "Deep work", ...preset }, actorUserId: admin })
    await saveRoomPreset({ id: null, input: { name: "Sprint", ...preset }, actorUserId: admin })
    expect((await listRoomPresets()).map((row) => row.name)).toEqual(["Deep work", "Sprint"])
    await deleteRoomPresets({ presetIds: [first.id], actorUserId: admin })
    expect((await listRoomPresets()).map((row) => row.name)).toEqual(["Sprint"])
  })
})

describe("room limits", () => {
  it("refuses the next person into a full room, never the host", async () => {
    const admin = (await insertUser(db, { role: "admin" })).id
    const [host, sam, kim] = [(await insertUser(db)).id, (await insertUser(db)).id, (await insertUser(db)).id]
    const room = await openRoom(host, "small")
    await saveAppSetting({
      key: "rooms.limits",
      value: { maxPeople: 2, maxRepeatsPerHost: 5, maxInvitesPerRoom: 20 },
      actorUserId: admin,
    })
    await joinRoomBySlug(room.slug, sam, db)
    await expect(joinRoomBySlug(room.slug, kim, db)).rejects.toThrow("ROOM_FULL")
    await expect(joinRoomBySlug(room.slug, host, db)).resolves.toBeTruthy()
  })
})
