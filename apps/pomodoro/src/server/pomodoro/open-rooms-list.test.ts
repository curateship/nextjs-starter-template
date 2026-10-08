import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { type CustomShellDb } from "@/server/db"
import {
  createRoomWithHost,
  joinRoomBySlug,
  leaveRoom,
  listPublicRooms,
  roomSnapshot,
  type RoomSettings,
} from "@/server/pomodoro/rooms"
import { createTestDatabase, insertUser } from "@/server/test-support"

/**
 * Open to join leaves out the viewer's own rooms. Tyler, 8 Oct 2026: "The open
 * to join shouildnt show the room I hosted".
 */

const SETTINGS: RoomSettings = {
  name: "Morning deep work",
  visibility: "public",
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  autoStart: false,
  sound: "curated:rain",
  background: "scene:plain",
}

let client: PGlite
let db: CustomShellDb
let hostId: string
let memberId: string
let strangerId: string

beforeEach(async () => {
  ;({ client, db } = await createTestDatabase())
  hostId = (await insertUser(db, { name: "Sam Host" })).id
  memberId = (await insertUser(db, { name: "Alex Member" })).id
  strangerId = (await insertUser(db, { name: "Kim Stranger" })).id
})

afterEach(async () => {
  await client.close()
})

async function openRoom() {
  const slug = `slug-${Math.random().toString(36).slice(2, 12)}pad`
  const { room } = await createRoomWithHost(hostId, slug, SETTINGS, db)
  return room
}

const names = (rows: Awaited<ReturnType<typeof listPublicRooms>>) =>
  rows.map((row) => row.room.name)

describe("Open to join", () => {
  it("leaves out the room the viewer hosts", async () => {
    await openRoom()
    expect(names(await listPublicRooms(hostId, db))).toEqual([])
  })

  it("leaves out the room the viewer is sitting in", async () => {
    const room = await openRoom()
    await joinRoomBySlug(room.slug, memberId, db)
    expect(names(await listPublicRooms(memberId, db))).toEqual([])
  })

  it("shows the room to everybody else, with its full head count", async () => {
    const room = await openRoom()
    await joinRoomBySlug(room.slug, memberId, db)
    const rows = await listPublicRooms(strangerId, db)
    expect(names(rows)).toEqual(["Morning deep work"])
    expect(rows[0].memberCount).toBe(2)
  })

  it("shows the room again to somebody who left it", async () => {
    const room = await openRoom()
    await joinRoomBySlug(room.slug, memberId, db)
    await leaveRoom(room.slug, memberId, db)
    expect(names(await listPublicRooms(memberId, db))).toEqual([
      "Morning deep work",
    ])
  })

  it("marks the viewer's own row in a room's snapshot", async () => {
    const room = await openRoom()
    await joinRoomBySlug(room.slug, memberId, db)
    const snapshot = await roomSnapshot(room.id, memberId, db)
    expect(
      snapshot.members.map((member) => [member.name, member.mine])
    ).toEqual([
      ["Sam Host", false],
      ["Alex Member", true],
    ])
  })
})
