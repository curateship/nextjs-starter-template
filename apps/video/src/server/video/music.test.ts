import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  MUSIC_FILE_NOT_FOUND_MESSAGE,
  MUSIC_NOT_SOUND_MESSAGE,
} from "@/lib/video/background-music"
import { uuid } from "@/server/auth/security"
import { type CustomShellDb } from "@/server/db"
import { customShellMedia, type CustomShellUser } from "@/server/schema"
import {
  createTestDatabase,
  insertUser,
  insertWorkspace,
} from "@/server/test-support"
import { listMusicShelf, markAsMusic, unmarkMusic } from "@/server/video/music"
import { videoMusicTracks } from "@/server/video/schema"

let client: PGlite
let database: CustomShellDb
let user: CustomShellUser
let workspaceId: string

// serializeMedia builds public URLs, which need the R2 base.
const hadOriginalR2PublicUrl = Object.prototype.hasOwnProperty.call(
  process.env,
  "CUSTOM_SHELL_R2_PUBLIC_URL"
)
const originalR2PublicUrl = process.env.CUSTOM_SHELL_R2_PUBLIC_URL

beforeEach(async () => {
  process.env.CUSTOM_SHELL_R2_PUBLIC_URL = "https://video-media.example.test"
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  user = await insertUser(database)
  workspaceId = (await insertWorkspace(database, { userId: user.id })).id
})

afterEach(async () => {
  await client.close()
  if (hadOriginalR2PublicUrl) {
    process.env.CUSTOM_SHELL_R2_PUBLIC_URL = originalR2PublicUrl
  } else {
    delete process.env.CUSTOM_SHELL_R2_PUBLIC_URL
  }
})

let clock = Date.UTC(2026, 8, 23)

async function insertSound(
  ownerId: string,
  overrides: Partial<typeof customShellMedia.$inferInsert> = {}
) {
  // Each file a second newer than the last, so "newest first" is testable.
  clock += 1000
  const timestamp = new Date(clock)
  const [row] = await database
    .insert(customShellMedia)
    .values({
      id: uuid(),
      workspaceId,
      userId: ownerId,
      filename: `${uuid()}.mp3`,
      originalName: "sound.mp3",
      fileSize: 1000,
      mimeType: "audio/mpeg",
      fileType: "audio",
      storagePath: `${ownerId}/${uuid()}.mp3`,
      createdAt: timestamp,
      updatedAt: timestamp,
      ...overrides,
    })
    .returning()
  return row
}

describe("the music shelf", () => {
  it("lists the person's sound files with the music first", async () => {
    const song = await insertSound(user.id, { originalName: "song.mp3" })
    await insertSound(user.id, { originalName: "voiceover.mp3" })
    await insertSound(user.id, {
      originalName: "picture.png",
      mimeType: "image/png",
      fileType: "image",
    })
    const stranger = await insertUser(database)
    await insertSound(stranger.id, { originalName: "theirs.mp3" })

    await markAsMusic(user.id, song.id, database)

    const shelf = await listMusicShelf(user.id, database)
    expect(shelf.map((file) => [file.original_name, file.is_music])).toEqual([
      ["song.mp3", true],
      ["voiceover.mp3", false],
    ])
    expect(shelf[0].url).toMatch(/^https:\/\/video-media\.example\.test\//)
  })

  it("marks a file once however many times it is asked", async () => {
    const song = await insertSound(user.id)
    await markAsMusic(user.id, song.id, database)
    await markAsMusic(user.id, song.id, database)
    expect(await database.select().from(videoMusicTracks)).toHaveLength(1)
  })

  it("takes the mark off and leaves the file in the library", async () => {
    const song = await insertSound(user.id)
    await markAsMusic(user.id, song.id, database)
    await unmarkMusic(user.id, song.id, database)

    const shelf = await listMusicShelf(user.id, database)
    expect(shelf.map((file) => [file.id, file.is_music])).toEqual([
      [song.id, false],
    ])
  })

  it("refuses to mark or unmark somebody else's file", async () => {
    const stranger = await insertUser(database)
    const theirs = await insertSound(stranger.id)
    await markAsMusic(stranger.id, theirs.id, database)

    await expect(markAsMusic(user.id, theirs.id, database)).rejects.toThrow(
      MUSIC_FILE_NOT_FOUND_MESSAGE
    )
    await expect(unmarkMusic(user.id, theirs.id, database)).rejects.toThrow(
      MUSIC_FILE_NOT_FOUND_MESSAGE
    )
    expect(await database.select().from(videoMusicTracks)).toHaveLength(1)
  })

  it("refuses a file that is not sound", async () => {
    const picture = await insertSound(user.id, {
      mimeType: "image/png",
      fileType: "image",
    })
    await expect(markAsMusic(user.id, picture.id, database)).rejects.toThrow(
      MUSIC_NOT_SOUND_MESSAGE
    )
  })

  it("forgets the mark when the file is deleted", async () => {
    const song = await insertSound(user.id)
    await markAsMusic(user.id, song.id, database)
    await database.delete(customShellMedia).where(eq(customShellMedia.id, song.id))
    expect(await database.select().from(videoMusicTracks)).toEqual([])
  })
})
