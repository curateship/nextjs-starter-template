import { PGlite } from "@electric-sql/pglite"
import { eq, sql } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  SOUND_FILE_NOT_FOUND_MESSAGE,
  SOUND_NOT_SOUND_MESSAGE,
} from "@/lib/video/stock-sounds"
import { uuid } from "@/server/auth/security"
import { type CustomShellDb } from "@/server/db"
import { customShellMedia, type CustomShellUser } from "@/server/schema"
import {
  createTestDatabase,
  insertUser,
  insertWorkspace,
} from "@/server/test-support"
import {
  listSoundEffects,
  markAsSoundEffect,
  unmarkSoundEffect,
} from "@/server/video/sound-effects"
import { readOwnedBeats, requestOwnedCleanSound } from "@/server/video/sound-tools"
import {
  videoMediaBeats,
  videoMediaCleanSounds,
  videoMusicTracks,
} from "@/server/video/schema"

let client: PGlite
let database: CustomShellDb
let user: CustomShellUser
let other: CustomShellUser
let workspaceId: string

const hadPublicUrl = Object.prototype.hasOwnProperty.call(process.env, "CUSTOM_SHELL_R2_PUBLIC_URL")
const originalPublicUrl = process.env.CUSTOM_SHELL_R2_PUBLIC_URL

beforeEach(async () => {
  process.env.CUSTOM_SHELL_R2_PUBLIC_URL = "https://video-media.example.test"
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  user = await insertUser(database)
  other = await insertUser(database)
  workspaceId = (await insertWorkspace(database, { userId: user.id })).id
})

afterEach(async () => {
  await client.close()
  if (hadPublicUrl) process.env.CUSTOM_SHELL_R2_PUBLIC_URL = originalPublicUrl
  else delete process.env.CUSTOM_SHELL_R2_PUBLIC_URL
})

async function insertFile(ownerId: string, fileType: "audio" | "video" | "image" = "audio") {
  const timestamp = new Date()
  const [row] = await database
    .insert(customShellMedia)
    .values({
      id: uuid(),
      workspaceId,
      userId: ownerId,
      filename: `${uuid()}.mp3`,
      originalName: "sound.mp3",
      fileSize: 1000,
      mimeType: fileType === "audio" ? "audio/mpeg" : fileType === "video" ? "video/mp4" : "image/png",
      fileType,
      storagePath: `${ownerId}/${uuid()}`,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .returning()
  return row
}

describe("your own sound effects", () => {
  it("lists only the person's own marked sounds", async () => {
    const mine = await insertFile(user.id)
    await insertFile(user.id)
    const theirs = await insertFile(other.id)
    await markAsSoundEffect(user.id, mine.id, database)
    await markAsSoundEffect(other.id, theirs.id, database)
    expect((await listSoundEffects(user.id, database)).map((file) => file.id)).toEqual([mine.id])
  })

  it("never marks somebody else's file, or a file that is not sound", async () => {
    const theirs = await insertFile(other.id)
    const picture = await insertFile(user.id, "image")
    await expect(markAsSoundEffect(user.id, theirs.id, database)).rejects.toThrow(
      SOUND_FILE_NOT_FOUND_MESSAGE
    )
    await expect(markAsSoundEffect(user.id, picture.id, database)).rejects.toThrow(
      SOUND_NOT_SOUND_MESSAGE
    )
  })

  it("takes the mark off and leaves the file in the library", async () => {
    const mine = await insertFile(user.id)
    await markAsSoundEffect(user.id, mine.id, database)
    await unmarkSoundEffect(user.id, mine.id, database)
    expect(await listSoundEffects(user.id, database)).toEqual([])
    const [file] = await database.select().from(customShellMedia).where(eq(customShellMedia.id, mine.id))
    expect(file).toBeDefined()
  })
})

describe("a cleaned copy of a file's sound", () => {
  it("is queued the first time it is asked for, once per strength", async () => {
    const take = await insertFile(user.id, "video")
    expect(await requestOwnedCleanSound(user.id, take.id, "medium", {}, database)).toEqual({
      status: "preparing",
    })
    await requestOwnedCleanSound(user.id, take.id, "medium", {}, database)
    await requestOwnedCleanSound(user.id, take.id, "strong", {}, database)
    const rows = await database.select().from(videoMediaCleanSounds)
    expect(rows.map((row) => row.id).sort()).toEqual([`${take.id}:medium`, `${take.id}:strong`])
    expect(rows.every((row) => row.status === "queued")).toBe(true)
  })

  it("hands back where to play it once ready", async () => {
    const take = await insertFile(user.id)
    await requestOwnedCleanSound(user.id, take.id, "light", {}, database)
    await database
      .update(videoMediaCleanSounds)
      .set({ status: "ready", storagePath: "video/clean-sound/x.m4a" })
      .where(eq(videoMediaCleanSounds.id, `${take.id}:light`))
    expect(await requestOwnedCleanSound(user.id, take.id, "light", {}, database)).toEqual({
      status: "ready",
      url: "https://video-media.example.test/video/clean-sound/x.m4a",
    })
  })

  it("says why it failed, and Try again puts it back with fresh tries", async () => {
    const take = await insertFile(user.id)
    await requestOwnedCleanSound(user.id, take.id, "strong", {}, database)
    await database
      .update(videoMediaCleanSounds)
      .set({ status: "error", error: "This file has no sound to clean", attempts: 3 })
    expect(await requestOwnedCleanSound(user.id, take.id, "strong", {}, database)).toEqual({
      status: "failed",
      error: "This file has no sound to clean",
    })
    expect(
      await requestOwnedCleanSound(user.id, take.id, "strong", { retry: true }, database)
    ).toEqual({ status: "preparing" })
    const [row] = await database.select().from(videoMediaCleanSounds)
    expect(row).toMatchObject({ status: "queued", attempts: 0, error: null })
  })

  it("is never made of somebody else's file or a picture", async () => {
    const theirs = await insertFile(other.id)
    const picture = await insertFile(user.id, "image")
    await expect(requestOwnedCleanSound(user.id, theirs.id, "medium", {}, database)).rejects.toThrow(
      "Media not found"
    )
    await expect(requestOwnedCleanSound(user.id, picture.id, "medium", {}, database)).rejects.toThrow()
    expect(await database.select().from(videoMediaCleanSounds)).toEqual([])
  })

  it("goes when its file is deleted", async () => {
    const take = await insertFile(user.id)
    await requestOwnedCleanSound(user.id, take.id, "medium", {}, database)
    await database.delete(customShellMedia).where(eq(customShellMedia.id, take.id))
    expect(await database.select().from(videoMediaCleanSounds)).toEqual([])
  })
})

describe("a music file's beats", () => {
  async function beatsRow(mediaId: string, status: string, beats: number[] | null) {
    await database.insert(videoMusicTracks).values({ mediaId, createdAt: new Date() })
    await database.insert(videoMediaBeats).values({
      mediaId,
      status,
      beats,
      tempo: beats ? 120 : null,
      createdAt: sql`now()`,
      updatedAt: sql`now()`,
    })
  }

  it("answers with the beats found, and waits on the ones still being found", async () => {
    const song = await insertFile(user.id)
    const later = await insertFile(user.id)
    const voice = await insertFile(user.id)
    await beatsRow(song.id, "ready", [250, 750])
    await beatsRow(later.id, "generating", null)
    expect(await readOwnedBeats(user.id, [song.id, later.id, voice.id], database)).toEqual({
      [song.id]: { status: "ready", beats: [250, 750], tempo: 120 },
      [later.id]: { status: "preparing" },
    })
  })

  it("reads a music file the worker has not reached yet as being found", async () => {
    const song = await insertFile(user.id)
    await database.insert(videoMusicTracks).values({ mediaId: song.id, createdAt: new Date() })
    expect(await readOwnedBeats(user.id, [song.id], database)).toEqual({
      [song.id]: { status: "preparing" },
    })
  })

  it("never reads somebody else's", async () => {
    const theirs = await insertFile(other.id)
    await beatsRow(theirs.id, "ready", [500])
    expect(await readOwnedBeats(user.id, [theirs.id], database)).toEqual({})
  })
})
