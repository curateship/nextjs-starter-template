import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { uuid } from "@/server/auth/security"
import { type CustomShellDb } from "@/server/db"
import { customShellMedia, type CustomShellUser } from "@/server/schema"
import {
  createTestDatabase,
  insertUser,
  insertWorkspace,
} from "@/server/test-support"
import { videoVoiceovers } from "@/server/video/schema"
import { listVoiceovers, storeVoiceover } from "@/server/video/voiceovers"

let client: PGlite
let database: CustomShellDb
let user: CustomShellUser
let workspaceId: string

// The list builds public URLs, which need the R2 base.
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

function soundRow(ownerId: string) {
  // Each file a second newer than the last, so "newest first" is testable.
  clock += 1000
  const at = new Date(clock)
  const filename = `${uuid()}-voiceover.mp3`
  return {
    id: uuid(),
    workspaceId,
    userId: ownerId,
    filename,
    originalName: "voiceover.mp3",
    fileSize: 1000,
    mimeType: "audio/mpeg",
    fileType: "audio",
    storagePath: `${ownerId}/${filename}`,
    createdAt: at,
    updatedAt: at,
  }
}

const signOff = {
  script: "Thanks for watching, see you next week.",
  voiceId: "voice-rachel",
  voiceName: "Rachel",
  durationMs: 2400,
  captions: [
    {
      startMs: 0,
      endMs: 1200,
      text: "Thanks for watching,",
      words: [
        { startMs: 0, endMs: 500 },
        { startMs: 500, endMs: 800 },
        { startMs: 800, endMs: 1200 },
      ],
    },
    { startMs: 1200, endMs: 2400, text: "see you next week." },
  ],
}

describe("the voiceover shelf", () => {
  it("keeps the words, the voice and the captions beside the file", async () => {
    const media = soundRow(user.id)
    await storeVoiceover(media, signOff, database)

    const [saved] = await listVoiceovers(user.id, "", database)
    expect(saved).toEqual({
      mediaId: media.id,
      name: "Thanks for watching, see you next week.",
      url: `https://video-media.example.test/${media.storagePath}`,
      script: signOff.script,
      voiceName: "Rachel",
      durationMs: 2400,
      captions: signOff.captions,
    })
  })

  it("writes neither row when the shelf row cannot be written", async () => {
    const media = soundRow(user.id)
    await expect(
      storeVoiceover(
        media,
        // Longer than the column allows, so the second insert fails.
        { ...signOff, voiceId: "x".repeat(65) },
        database
      )
    ).rejects.toThrow()

    const files = await database
      .select()
      .from(customShellMedia)
      .where(eq(customShellMedia.id, media.id))
    expect(files).toEqual([])
  })

  it("finds a voiceover by any words it says, ignoring case", async () => {
    await storeVoiceover(soundRow(user.id), signOff, database)
    await storeVoiceover(
      soundRow(user.id),
      { ...signOff, script: "Link in the description." },
      database
    )

    const found = await listVoiceovers(user.id, "NEXT week", database)
    expect(found.map((one) => one.script)).toEqual([signOff.script])
  })

  it("finds a voiceover by the voice that read it", async () => {
    await storeVoiceover(soundRow(user.id), signOff, database)
    expect(await listVoiceovers(user.id, "rach", database)).toHaveLength(1)
    expect(await listVoiceovers(user.id, "adam", database)).toEqual([])
  })

  it("treats % and _ in a search as the characters themselves", async () => {
    await storeVoiceover(soundRow(user.id), signOff, database)
    expect(await listVoiceovers(user.id, "%", database)).toEqual([])
    expect(await listVoiceovers(user.id, "_", database)).toEqual([])
  })

  it("lists the newest first", async () => {
    await storeVoiceover(soundRow(user.id), { ...signOff, script: "First" }, database)
    await storeVoiceover(soundRow(user.id), { ...signOff, script: "Second" }, database)

    const listed = await listVoiceovers(user.id, "", database)
    expect(listed.map((one) => one.script)).toEqual(["Second", "First"])
  })

  it("shows nobody else's voiceovers", async () => {
    const other = await insertUser(database)
    await storeVoiceover(soundRow(other.id), signOff, database)
    expect(await listVoiceovers(user.id, "", database)).toEqual([])
  })

  it("goes when its file is deleted", async () => {
    const media = soundRow(user.id)
    await storeVoiceover(media, signOff, database)
    await database.delete(customShellMedia).where(eq(customShellMedia.id, media.id))

    expect(await listVoiceovers(user.id, "", database)).toEqual([])
    expect(await database.select().from(videoVoiceovers)).toEqual([])
  })

  it("leaves a voiceover made before the shelf existed alone", async () => {
    // An old voiceover is a media row with nothing beside it.
    const old = soundRow(user.id)
    await database.insert(customShellMedia).values(old)

    expect(await listVoiceovers(user.id, "", database)).toEqual([])
    const [file] = await database
      .select()
      .from(customShellMedia)
      .where(eq(customShellMedia.id, old.id))
    expect(file?.storagePath).toBe(old.storagePath)
  })
})
