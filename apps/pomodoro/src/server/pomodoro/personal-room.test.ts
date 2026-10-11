import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { randomUUID } from "node:crypto"

// Files never really leave for the bucket in a test.
vi.mock("@/server/media/storage", () => ({
  deleteFromR2: vi.fn(async () => undefined),
  uploadToR2: vi.fn(async () => undefined),
  getPublicMediaUrl: vi.fn(async (path: string) => `https://files.test/${path}`),
  getFromR2: vi.fn(),
  R2StorageNotConfiguredError: class extends Error {},
}))

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
import {
  pomodoroBlocks,
  pomodoroMediaUploads,
  pomodoroSavedMedia,
} from "@/server/pomodoro/schema"
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

describe("the member's own files for shuffle, and the look", () => {
  async function insertUpload(values: {
    purpose: "sound" | "background"
    kind: "audio" | "image"
    tags: string[]
    status?: string
    deletedAt?: Date
    owner?: string
    shared?: boolean
  }) {
    const owner = values.owner ?? memberId
    const workspace = await insertWorkspace(db)
    const mediaId = randomUUID()
    await db.insert(customShellMedia).values({
      id: mediaId,
      workspaceId: workspace.id,
      userId: owner,
      filename: "file",
      originalName: "file",
      fileSize: 1_000,
      mimeType: values.kind === "audio" ? "audio/mpeg" : "image/png",
      fileType: values.kind,
      storagePath: `test/${mediaId}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    await db.insert(pomodoroMediaUploads).values({
      mediaId,
      userId: owner,
      purpose: values.purpose,
      kind: values.kind,
      status: values.status ?? "ready",
      originalBytes: 1_000,
      name: `${values.purpose} ${values.tags.join(" ")}`,
      tags: values.tags,
      deletedAt: values.deletedAt ?? null,
      shared: values.shared ?? false,
      shareConfirmedAt: values.shared ? new Date() : null,
    })
    return mediaId
  }

  it("sends only tagged, finished files out of the bin, and the default look", async () => {
    const rain = await insertUpload({ purpose: "sound", kind: "audio", tags: ["rain"] })
    await insertUpload({ purpose: "sound", kind: "audio", tags: [] })
    await insertUpload({ purpose: "sound", kind: "audio", tags: ["rain"], status: "queued" })
    await insertUpload({ purpose: "sound", kind: "audio", tags: ["rain"], deletedAt: new Date() })
    const desk = await insertUpload({ purpose: "background", kind: "image", tags: ["desk"] })

    const bootstrap = await loadMediaBootstrap(memberId)
    expect(bootstrap.own.sounds.map((file) => file.mediaId)).toEqual([rain])
    expect(bootstrap.own.backgrounds).toMatchObject([{ mediaId: desk, kind: "image", tags: ["desk"] }])
    expect(bootstrap.look).toEqual({ dim: 0, drift: true })
  })

  it("adds shared files the member saved, until they stop being shared or a block comes between", async () => {
    const shared = await insertUpload({ purpose: "sound", kind: "audio", tags: ["rain"], owner: hostId, shared: true })
    const unshared = await insertUpload({ purpose: "sound", kind: "audio", tags: ["rain"], owner: hostId })
    await db.insert(pomodoroSavedMedia).values([
      { userId: memberId, mediaId: shared },
      { userId: memberId, mediaId: unshared },
    ])
    expect((await loadMediaBootstrap(memberId)).own.sounds.map((file) => file.mediaId)).toEqual([shared])

    await db.insert(pomodoroBlocks).values({ blockerUserId: hostId, blockedUserId: memberId })
    expect((await loadMediaBootstrap(memberId)).own.sounds).toEqual([])
  })

  it("lets an own file be the first pick of the personal room's tags group", async () => {
    const desk = await insertUpload({ purpose: "background", kind: "image", tags: ["desk"] })
    await savePersonalBackground(memberId, "tags:desk")
    const bootstrap = await loadMediaBootstrap(memberId)
    expect(bootstrap.picks.background).toBe(`media:${desk}`)
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
