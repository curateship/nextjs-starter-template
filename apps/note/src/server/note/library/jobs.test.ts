import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { now, uuid } from "@/server/auth/security"
import { type CustomShellDb } from "@/server/db"
import * as storage from "@/server/media/storage"
import { customShellMedia, customShellNotifications, type CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser, insertWorkspace } from "@/server/test-support"
import * as analysis from "@/server/note/analysis"
import * as download from "@/server/note/download"
import * as files from "@/server/note/files"
import * as gemini from "@/server/note/gemini"
import { importLink } from "@/server/note/library/imports"
import { runNext } from "@/server/note/library/jobs"
import { createLibrary } from "@/server/note/library/libraries"
import { SayableError } from "@/server/note/sayable"
import { noteNotes } from "@/server/note/schema"

/**
 * The `note-imports` worker's own rules. yt-dlp, the bucket, ffmpeg and Gemini
 * are all stood in for, so nothing here touches the network or spends money.
 */

let client: PGlite
let database: CustomShellDb
let user: CustomShellUser
let workspaceId: string
let libraryId: string

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  user = await insertUser(database)
  workspaceId = (await insertWorkspace(database)).id
  libraryId = (await createLibrary(user.id, { name: "Content ideas" })).id
  vi.spyOn(storage, "getPublicMediaUrl").mockImplementation(async (p) => `https://files.test/${p}`)
  vi.spyOn(storage, "deleteFromR2").mockResolvedValue(undefined)
  vi.spyOn(files, "discardFile").mockResolvedValue(undefined)
  // Nothing may reach the network: every download fails unless a test says.
  vi.spyOn(download, "downloadVideo").mockRejectedValue(new SayableError("This post is private"))
})

afterEach(async () => {
  await client.close()
  vi.restoreAllMocks()
})

async function insertMedia() {
  const id = uuid()
  const at = now()
  await database.insert(customShellMedia).values({
    id,
    workspaceId,
    userId: user.id,
    filename: `${id}.mp4`,
    originalName: "video.mp4",
    fileSize: 1000,
    mimeType: "video/mp4",
    fileType: "video",
    storagePath: `${user.id}/${id}.mp4`,
    createdAt: at,
    updatedAt: at,
  })
  return { id, storagePath: `${user.id}/${id}.mp4` }
}

async function rowOf(id: string) {
  const [row] = await database.select().from(noteNotes).where(eq(noteNotes.id, id))
  return row
}

/** A finished yt-dlp download of "Me at the zoo", without yt-dlp. */
async function standInDownload() {
  const dir = await mkdtemp(path.join(tmpdir(), "note-test-"))
  const media = await insertMedia()
  vi.spyOn(download, "downloadVideo").mockResolvedValue({
    dir,
    filePath: path.join(dir, "video.mp4"),
    mimeType: "video/mp4",
    kind: "video",
    sizeBytes: 1000,
    source: "youtube",
    platformVideoId: "jNQXAC9IVRw",
    title: "Me at the zoo",
    channelName: "jawed  ",
    durationSeconds: 19,
    postedAt: new Date("2005-04-23T00:00:00Z"),
  })
  vi.spyOn(files, "storeFile").mockResolvedValue(media)
  vi.spyOn(files, "lookAtFile").mockResolvedValue({ coverStoragePath: "note-covers/cover.jpg", durationSeconds: 19 })
  return media
}

describe("importing a video", () => {
  it("fills in the title, the cleaned channel name, the length and the file, and rings the bell", async () => {
    const media = await standInDownload()
    const { note } = await importLink(user.id, { libraryId, url: "https://www.youtube.com/watch?v=jNQXAC9IVRw" })
    await runNext()
    const row = await rowOf(note.id)
    expect(row).toMatchObject({
      importStatus: "saved",
      title: "Me at the zoo",
      authorName: "jawed",
      durationSeconds: 19,
      videoMediaId: media.id,
      leaseToken: null,
    })
    const bell = await database.select({ message: customShellNotifications.message }).from(customShellNotifications)
    expect(bell.map((each) => each.message)).toEqual(["Ready to analyse: Me at the zoo"])
  })

  it("keeps a title and an author typed while it imported", async () => {
    await standInDownload()
    const { note } = await importLink(user.id, { libraryId, url: "https://www.youtube.com/watch?v=jNQXAC9IVRw" })
    await database
      .update(noteNotes)
      .set({ title: "My zoo note", authorName: "Jawed Karim" })
      .where(eq(noteNotes.id, note.id))
    await runNext()
    expect(await rowOf(note.id)).toMatchObject({ title: "My zoo note", authorName: "Jawed Karim" })
  })

  it("keeps the site's own reason when the download fails", async () => {
    const { note } = await importLink(user.id, { libraryId, url: "https://www.youtube.com/watch?v=jNQXAC9IVRw" })
    await runNext()
    expect(await rowOf(note.id)).toMatchObject({ importStatus: "failed", importError: "This post is private" })
  })
})

describe("analysing a video already written down", () => {
  it("reads the words it has and never pays to hear the video again", async () => {
    const media = await insertMedia()
    const { note } = await importLink(user.id, { libraryId, url: "https://www.youtube.com/watch?v=jNQXAC9IVRw" })
    await database
      .update(noteNotes)
      .set({
        importStatus: "saved",
        videoMediaId: media.id,
        durationSeconds: 19,
        transcript: [{ startMs: 0, endMs: 2000, text: "Here we are at the zoo." }],
        tags: ["zoo"],
        analyseStatus: "queued",
        analysedAt: new Date(),
      })
      .where(eq(noteNotes.id, note.id))
    vi.spyOn(gemini, "requireGeminiKey").mockResolvedValue("test-key")
    const transcribe = vi.spyOn(analysis, "transcribe").mockRejectedValue(new Error("must not be called"))
    const summarise = vi.spyOn(analysis, "summarise").mockResolvedValue({
      summary: ["A man at the zoo."],
      actionPlan: [{ text: "Visit a zoo", done: false }],
      quotes: [],
      tags: ["elephants"],
    })
    await runNext()
    expect(transcribe).not.toHaveBeenCalled()
    expect(summarise).toHaveBeenCalledOnce()
    expect(await rowOf(note.id)).toMatchObject({
      analyseStatus: "ready",
      summary: ["A man at the zoo."],
      tags: ["zoo", "elephants"],
      leaseToken: null,
    })
  })
})
