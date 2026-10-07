import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { randomUUID } from "node:crypto"

import { type CustomShellDb } from "@/server/db"
import { deletePomodoroUpload } from "@/server/pomodoro/media-uploads"
import {
  loadMediaBootstrap,
  loadOrCreatePersonalRoom,
  savePersonalBackground,
  savePersonalSound,
} from "@/server/pomodoro/personal-room"
import {
  createRoomWithHost,
  findActiveRoomMedia,
  joinRoomBySlug,
  leaveRoom,
  roomSnapshot,
  saveRoomMedia,
  type RoomSettings,
} from "@/server/pomodoro/rooms"
import { pomodoroMediaUploads } from "@/server/pomodoro/schema"
import { customShellMedia } from "@/server/schema"
import {
  createTestDatabase,
  insertUser,
  insertWorkspace,
} from "@/server/test-support"

/**
 * Rooms task 02 against a real database: every account's personal room, and
 * the sound and theme a hosted room hands everyone in it.
 */

const SETTINGS: RoomSettings = {
  name: "Fireside",
  visibility: "unlisted",
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  autoStart: false,
  sound: "curated:piano",
  background: "scene:fireplace",
}

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

async function openRoom() {
  const slug = `slug-${Math.random().toString(36).slice(2, 12)}pad`
  const { room } = await createRoomWithHost(hostId, slug, SETTINGS, db)
  return room
}

describe("the personal room", () => {
  it("is made the first time an account is read, once, starting silent on the default scene", async () => {
    const first = await loadOrCreatePersonalRoom(memberId, db)
    const again = await loadOrCreatePersonalRoom(memberId, db)
    expect(first.userId).toBe(memberId)
    expect(again.createdAt).toEqual(first.createdAt)
    expect([first.sound, first.background]).toEqual([null, null])
  })

  it("keeps what is added to it, and a free account cannot add a Pro item", async () => {
    await savePersonalSound(memberId, "curated:rain")
    await savePersonalBackground(memberId, "scene:stars")
    const saved = await loadOrCreatePersonalRoom(memberId, db)
    expect([saved.sound, saved.background]).toEqual(["curated:rain", "scene:stars"])

    await expect(savePersonalSound(memberId, "curated:piano")).rejects.toThrow(
      "UPGRADE_REQUIRED:premiumMedia"
    )
    await expect(savePersonalBackground(memberId, "scene:nope")).rejects.toThrow(
      "UNKNOWN_BACKGROUND"
    )
  })
})

describe("deleting an upload that is in the personal room", () => {
  it("puts that room back to silence and leaves the theme alone", async () => {
    const workspace = await insertWorkspace(db)
    const mediaId = randomUUID()
    await db.insert(customShellMedia).values({
      id: mediaId,
      workspaceId: workspace.id,
      userId: memberId,
      filename: "loop.mp3",
      originalName: "loop.mp3",
      fileSize: 1_000,
      mimeType: "audio/mpeg",
      fileType: "audio",
      storagePath: `test/${mediaId}.mp3`,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    await db.insert(pomodoroMediaUploads).values({
      mediaId,
      userId: memberId,
      purpose: "sound",
      kind: "audio",
      status: "ready",
      originalBytes: 1_000,
    })
    await savePersonalSound(memberId, `media:${mediaId}`)
    await savePersonalBackground(memberId, "scene:stars")

    await deletePomodoroUpload(memberId, mediaId)

    const room = await loadOrCreatePersonalRoom(memberId, db)
    expect([room.sound, room.background]).toEqual([null, "scene:stars"])
  })
})

describe("a hosted room's pair", () => {
  it("is what everyone in the room gets, and your own room comes back when you leave", async () => {
    await savePersonalSound(memberId, "curated:cafe")
    const room = await openRoom()
    await joinRoomBySlug(room.slug, memberId, db)

    const inRoom = await loadMediaBootstrap(memberId)
    expect(inRoom.room).toMatchObject({
      slug: room.slug,
      role: "member",
      sound: "curated:piano",
      background: "scene:fireplace",
    })
    // The room never writes over the personal pair.
    expect(inRoom.personal.sound).toBe("curated:cafe")

    await leaveRoom(room.slug, memberId, db)
    expect(await findActiveRoomMedia(memberId, db)).toBeNull()
  })

  it("can be changed by the host only, and the next snapshot carries it", async () => {
    const room = await openRoom()
    await joinRoomBySlug(room.slug, memberId, db)

    await expect(
      saveRoomMedia(room.slug, memberId, { sound: "curated:rain", background: "scene:plain" }, db)
    ).rejects.toThrow("ROOM_HOST_REQUIRED")

    await saveRoomMedia(room.slug, hostId, { sound: "curated:rain", background: "scene:plain" }, db)
    const snapshot = await roomSnapshot(room.id, memberId, db)
    expect([snapshot.room.sound, snapshot.room.background]).toEqual([
      "curated:rain",
      "scene:plain",
    ])
  })

  it("is gone from the bootstrap once the host closes the room", async () => {
    const room = await openRoom()
    await joinRoomBySlug(room.slug, memberId, db)
    await leaveRoom(room.slug, hostId, db)
    expect(await findActiveRoomMedia(memberId, db)).toBeNull()
  })
})
