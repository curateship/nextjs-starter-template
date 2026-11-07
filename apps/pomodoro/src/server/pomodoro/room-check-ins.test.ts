import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { type CustomShellDb } from "@/server/db"
import {
  answerRoomCheckIn,
  applyHostRoomAction,
  createRoomWithHost,
  joinRoomBySlug,
  roomSnapshot,
  startCountedRooms,
  type RoomSettings,
} from "@/server/pomodoro/rooms"
import { rooms } from "@/server/pomodoro/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

/**
 * "Did you finish?" after a room's focus (Tyler's pick, 7 Nov 2026): only
 * people in the room answer, only on the break after a focus, a second press
 * changes the answer, and the next focus leaves every tick behind.
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
const later = (seconds: number) => new Date(NOW.getTime() + seconds * 1_000)

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

/** A room with a member in it, running its first focus. */
async function roomInFocus() {
  const { room } = await createRoomWithHost(hostId, "check-in-room-padding", SETTINGS, db, NOW)
  await joinRoomBySlug(room.slug, memberId, db, later(1))
  await applyHostRoomAction(room.slug, hostId, "start_focus", db, later(2))
  await startCountedRooms(later(7), db)
  return room
}

/** Alex's answer, as the room's snapshot shows it to the host. */
async function memberCheckIn(slug: string) {
  const [row] = await db.select({ id: rooms.id }).from(rooms).where(eq(rooms.slug, slug))
  const snapshot = await roomSnapshot(row.id, hostId, db)
  return snapshot.members.find((member) => member.name.startsWith("Alex"))?.checkIn ?? null
}

describe("room check-in", () => {
  it("is refused during the focus itself", async () => {
    const room = await roomInFocus()
    await expect(answerRoomCheckIn(room.slug, memberId, true, db, later(60))).rejects.toThrow("ROOM_NOT_ON_BREAK")
  })

  it("is refused to somebody who is not in the room", async () => {
    const room = await roomInFocus()
    await applyHostRoomAction(room.slug, hostId, "start_break", db, later(60))
    const outsider = (await insertUser(db)).id
    await expect(answerRoomCheckIn(room.slug, outsider, true, db, later(70))).rejects.toThrow("ROOM_MEMBERSHIP_REQUIRED")
  })

  it("shows on the break, changes on a second press, and clears with the next focus", async () => {
    const room = await roomInFocus()
    await applyHostRoomAction(room.slug, hostId, "start_break", db, later(60))

    await answerRoomCheckIn(room.slug, memberId, true, db, later(70))
    expect(await memberCheckIn(room.slug)).toBe("finished")

    await answerRoomCheckIn(room.slug, memberId, false, db, later(80))
    expect(await memberCheckIn(room.slug)).toBe("not_yet")

    await applyHostRoomAction(room.slug, hostId, "start_focus", db, later(120))
    expect(await memberCheckIn(room.slug)).toBe(null)
  })
})
