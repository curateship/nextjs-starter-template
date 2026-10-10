import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { isStartingSoon } from "@/lib/pomodoro/room-countdown"
import { type CustomShellDb } from "@/server/db"
import {
  applyHostRoomAction,
  createRoomWithHost,
  joinRoomBySlug,
  listPublicRooms,
  setRoomStartDelay,
  startCountedRooms,
  type RoomSettings,
} from "@/server/pomodoro/rooms"
import { pomodoroProfiles, rooms } from "@/server/pomodoro/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

/**
 * "Starting in", 9 Oct 2026: a host's Start in a waiting room begins a
 * countdown, 5 seconds until the host picks longer; joining never cuts it
 * short; the room clock starts the focus when it ends; and the room list
 * carries the countdown and the faces of the people inside.
 */

const SETTINGS: RoomSettings = {
  name: "Morning pages",
  visibility: "public",
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  autoStart: false,
  sound: "curated:rain",
  background: "scene:plain",
}
const NOW = new Date("2099-03-04T09:00:00Z")

let client: PGlite
let db: CustomShellDb
let hostId: string
let memberId: string
let viewerId: string

beforeEach(async () => {
  ;({ client, db } = await createTestDatabase())
  hostId = (await insertUser(db, { name: "Sam Host" })).id
  memberId = (await insertUser(db, { name: "Alex Member", avatarUrl: "https://example.test/alex.png" })).id
  viewerId = (await insertUser(db)).id
  await db.insert(pomodoroProfiles).values({ userId: hostId, publicDisplayName: "Sam" })
})

afterEach(async () => {
  await client.close()
})

async function openRoom() {
  const { room } = await createRoomWithHost(hostId, "countdown-room-padding", SETTINGS, db, NOW)
  return room
}

async function read(id: string) {
  const [room] = await db.select().from(rooms).where(eq(rooms.id, id))
  return room
}

describe("Starting in", () => {
  it("counts 5 seconds by default, then the room clock starts the focus", async () => {
    const room = await openRoom()
    expect(room.startDelaySeconds).toBe(5)
    const { room: counting } = await applyHostRoomAction(room.slug, hostId, "start_focus", db, NOW)
    expect(counting.phase).toBe("waiting")
    expect(counting.startingAt?.toISOString()).toBe("2099-03-04T09:00:05.000Z")
    expect(counting.countdownSeconds).toBe(5)

    // Somebody joining does not start it early.
    await joinRoomBySlug(room.slug, memberId, db, new Date(NOW.getTime() + 2_000))
    expect(await startCountedRooms(new Date(NOW.getTime() + 4_000), db)).toBe(0)
    expect((await read(room.id)).phase).toBe("waiting")

    expect(await startCountedRooms(new Date(NOW.getTime() + 5_000), db)).toBe(1)
    const started = await read(room.id)
    expect(started.phase).toBe("focus")
    expect(started.startingAt).toBeNull()
    expect(started.countdownSeconds).toBeNull()
  })

  it("takes the host's choice, starts at once on a second Start, and stops on Cancel", async () => {
    const room = await openRoom()
    await expect(setRoomStartDelay(room.slug, hostId, 30, db)).rejects.toThrow("ROOM_START_DELAY_INVALID")
    await expect(setRoomStartDelay(room.slug, memberId, 60, db)).rejects.toThrow("ROOM_HOST_REQUIRED")
    await setRoomStartDelay(room.slug, hostId, 120, db)

    const { room: counting } = await applyHostRoomAction(room.slug, hostId, "start_focus", db, NOW)
    expect(counting.countdownSeconds).toBe(120)
    const { room: cancelled } = await applyHostRoomAction(room.slug, hostId, "cancel_start", db, NOW)
    expect(cancelled.startingAt).toBeNull()
    expect(cancelled.phase).toBe("waiting")

    await applyHostRoomAction(room.slug, hostId, "start_focus", db, NOW)
    const { room: now } = await applyHostRoomAction(room.slug, hostId, "start_focus", db, new Date(NOW.getTime() + 10_000))
    expect(now.phase).toBe("focus")
    expect(now.startingAt).toBeNull()
  })

  it("lists a minute or more under Starting soon, never a 5-second countdown", async () => {
    const room = await openRoom()
    await applyHostRoomAction(room.slug, hostId, "start_focus", db, NOW)
    const [short] = await listPublicRooms(viewerId, db)
    expect(isStartingSoon(short.room, NOW.getTime() + 1_000)).toBe(false)

    await applyHostRoomAction(room.slug, hostId, "cancel_start", db, NOW)
    await setRoomStartDelay(room.slug, hostId, 60, db)
    await applyHostRoomAction(room.slug, hostId, "start_focus", db, NOW)
    const [long] = await listPublicRooms(viewerId, db)
    expect(isStartingSoon(long.room, NOW.getTime() + 1_000)).toBe(true)
    expect(isStartingSoon(long.room, NOW.getTime() + 61_000)).toBe(false)
  })
})

describe("the room card's faces", () => {
  it("carry the host's photo and the people inside, a photo or a name for initials", async () => {
    await db.insert(pomodoroProfiles).values({ userId: memberId, profilePublic: true })
    const room = await openRoom()
    await joinRoomBySlug(room.slug, memberId, db, NOW)
    const [row] = await listPublicRooms(viewerId, db)
    expect(row.hostName).toBe("Sam")
    expect(row.hostAvatarUrl).toBeNull()
    expect(row.people).toEqual([{ name: "Alex Member", avatarUrl: "https://example.test/alex.png" }])
    expect(row.memberCount).toBe(2)
  })

  it("show initials, never the photo, for a profile switched off or hidden", async () => {
    await db.insert(pomodoroProfiles).values({ userId: memberId, profilePublic: false })
    const room = await openRoom()
    await joinRoomBySlug(room.slug, memberId, db, NOW)
    const [off] = await listPublicRooms(viewerId, db)
    expect(off.people).toEqual([{ name: "Alex Member", avatarUrl: null }])

    await db.update(pomodoroProfiles).set({ profilePublic: true, hiddenAt: NOW }).where(eq(pomodoroProfiles.userId, memberId))
    const [hidden] = await listPublicRooms(viewerId, db)
    expect(hidden.people).toEqual([{ name: "Alex Member", avatarUrl: null }])
  })
})
