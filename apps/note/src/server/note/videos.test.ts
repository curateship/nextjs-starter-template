import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { now, uuid } from "@/server/auth/security"
import * as keys from "@/server/ai/keys"
import { type CustomShellDb } from "@/server/db"
import * as storage from "@/server/media/storage"
import { customShellMedia, type CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser, insertWorkspace } from "@/server/test-support"
import { createFolder } from "@/server/note/folders"
import { noteVideos } from "@/server/note/schema"
import {
  analyseVideo,
  deleteVideo,
  finishUpload,
  listVideos,
  loadVideo,
  moveVideo,
  retryVideo,
  saveLink,
  saveNote,
  tickStep,
} from "@/server/note/videos"
import { NO_FOLDER } from "@/lib/note/videos"

/**
 * The rules a click runs into: one row per video however often it is saved,
 * every read and change scoped to its owner, Try again picking the right
 * queue, and Delete taking the file, the cover and both rows with it.
 *
 * Nothing here downloads, stores or asks an AI anything. The bucket and the
 * Gemini key are stood in for.
 */

let client: PGlite
let database: CustomShellDb
let user: CustomShellUser
let workspaceId: string

const YOUTUBE = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  user = await insertUser(database)
  workspaceId = (await insertWorkspace(database)).id
  vi.spyOn(storage, "getPublicMediaUrl").mockImplementation(
    async (path) => `https://files.test/${path}`
  )
  vi.spyOn(storage, "deleteFromR2").mockResolvedValue(undefined)
})

afterEach(async () => {
  await client.close()
  vi.restoreAllMocks()
})

async function insertMedia(ownerId: string, overrides: Partial<typeof customShellMedia.$inferInsert> = {}) {
  const id = uuid()
  const at = now()
  await database.insert(customShellMedia).values({
    id,
    workspaceId,
    userId: ownerId,
    filename: `${id}.mp4`,
    originalName: "Pricing talk.mp4",
    fileSize: 20 * 1024 * 1024,
    mimeType: "video/mp4",
    fileType: "video",
    storagePath: `${ownerId}/${id}.mp4`,
    createdAt: at,
    updatedAt: at,
    ...overrides,
  })
  return id
}

async function rowOf(id: string) {
  const [row] = await database.select().from(noteVideos).where(eq(noteVideos.id, id))
  return row
}

describe("saving a link", () => {
  it("writes one waiting row for the worker", async () => {
    const { video: card, alreadySaved } = await saveLink(user.id, YOUTUBE)
    expect(alreadySaved).toBe(false)
    expect(card).toMatchObject({ status: "waiting", source: "youtube", hasFile: false })
    expect((await rowOf(card.id)).platformVideoId).toBe("dQw4w9WgXcQ")
  })

  it("hands back the first row when the same YouTube link is saved again", async () => {
    const first = (await saveLink(user.id, YOUTUBE)).video
    const second = await saveLink(user.id, "https://youtu.be/dQw4w9WgXcQ")
    expect(second).toMatchObject({ alreadySaved: true, video: { id: first.id } })
    const rows = await database.select().from(noteVideos).where(eq(noteVideos.ownerId, user.id))
    expect(rows).toHaveLength(1)
  })

  it("is each person's own row when two people save the same video", async () => {
    const other = await insertUser(database)
    const mine = (await saveLink(user.id, YOUTUBE)).video
    const theirs = (await saveLink(other.id, YOUTUBE)).video
    expect(theirs.id).not.toBe(mine.id)
  })

  it("writes nothing for a link that is not a video", async () => {
    await expect(saveLink(user.id, "http://www.youtube.com/watch?v=dQw4w9WgXcQ")).rejects.toThrow(
      "That is not a link to a video"
    )
    expect(await database.select().from(noteVideos)).toHaveLength(0)
  })
})

describe("finishing an upload", () => {
  it("makes a saved video from the person's own file, named after it", async () => {
    const mediaId = await insertMedia(user.id)
    const card = await finishUpload(user.id, mediaId)
    expect(card).toMatchObject({
      source: "upload",
      status: "saved",
      kind: "video",
      title: "Pricing talk",
      hasFile: true,
      coverUrl: null,
    })
  })

  it("calls a sound file sound", async () => {
    const mediaId = await insertMedia(user.id, {
      mimeType: "audio/mpeg",
      fileType: "audio",
      originalName: "Interview.mp3",
    })
    expect(await finishUpload(user.id, mediaId)).toMatchObject({ kind: "audio", title: "Interview" })
  })

  it("hands back the same video when asked twice for one file", async () => {
    const mediaId = await insertMedia(user.id)
    const first = await finishUpload(user.id, mediaId)
    expect((await finishUpload(user.id, mediaId)).id).toBe(first.id)
  })

  it("refuses somebody else's file", async () => {
    const other = await insertUser(database)
    const theirs = await insertMedia(other.id)
    await expect(finishUpload(user.id, theirs)).rejects.toThrow("Video not found")
  })

  it("refuses a file over 500MB", async () => {
    const mediaId = await insertMedia(user.id, { fileSize: 600 * 1024 * 1024 })
    await expect(finishUpload(user.id, mediaId)).rejects.toThrow("Up to 500MB")
  })
})

describe("the list", () => {
  it("searches only the owner's titles, words and tags", async () => {
    const other = await insertUser(database)
    const mine = (await saveLink(user.id, YOUTUBE)).video
    const theirs = (await saveLink(other.id, YOUTUBE)).video
    await database
      .update(noteVideos)
      .set({ transcriptText: "we talk about pricing a product", tags: ["launch"] })
      .where(eq(noteVideos.id, mine.id))
    await database
      .update(noteVideos)
      .set({ title: "Pricing for everyone", transcriptText: "pricing pricing" })
      .where(eq(noteVideos.id, theirs.id))

    const byWords = await listVideos(user.id, { search: "PRICING" })
    expect(byWords.videos.map((video) => video.id)).toEqual([mine.id])
    const byTag = await listVideos(user.id, { search: "launch" })
    expect(byTag.videos.map((video) => video.id)).toEqual([mine.id])
    expect((await listVideos(user.id, { search: "nothing like it" })).videos).toEqual([])
  })

  it("treats % and _ in a search as plain characters", async () => {
    const card = (await saveLink(user.id, YOUTUBE)).video
    await database.update(noteVideos).set({ title: "100% done" }).where(eq(noteVideos.id, card.id))
    expect((await listVideos(user.id, { search: "100%" })).videos).toHaveLength(1)
    expect((await listVideos(user.id, { search: "1_0" })).videos).toHaveLength(0)
  })

  it("narrows to one folder, or to the videos in no folder", async () => {
    const folders = await createFolder(user.id, "Pricing")
    const folderId = folders.folders[0].id
    const filed = (await saveLink(user.id, YOUTUBE)).video
    const loose = (await saveLink(user.id, "https://youtu.be/abcdefghijk")).video
    await moveVideo(user.id, filed.id, folderId)

    expect((await listVideos(user.id, { folder: folderId })).videos.map((v) => v.id)).toEqual([filed.id])
    expect((await listVideos(user.id, { folder: NO_FOLDER })).videos.map((v) => v.id)).toEqual([loose.id])
    expect((await listVideos(user.id)).videos).toHaveLength(2)
  })

  it("comes fifty at a time, newest first, with Show older for the rest", async () => {
    const start = Date.now()
    await database.insert(noteVideos).values(
      Array.from({ length: 52 }, (_, index) => ({
        id: uuid(),
        ownerId: user.id,
        source: "upload",
        kind: "video" as const,
        status: "saved" as const,
        title: `Video ${index}`,
        createdAt: new Date(start + index * 1000),
        updatedAt: new Date(start + index * 1000),
      }))
    )
    const first = await listVideos(user.id)
    expect(first.videos).toHaveLength(50)
    expect(first.videos[0].title).toBe("Video 51")
    expect(first.nextCursor).not.toBeNull()
    const older = await listVideos(user.id, { cursor: first.nextCursor })
    expect(older.videos.map((video) => video.title)).toEqual(["Video 1", "Video 0"])
    expect(older.nextCursor).toBeNull()
  })
})

describe("Analyse and Try again", () => {
  it("refuses Analyse with no Gemini key saved", async () => {
    vi.spyOn(keys, "getAiKey").mockResolvedValue(null)
    const card = await finishUpload(user.id, await insertMedia(user.id))
    await expect(analyseVideo(user.id, card.id)).rejects.toThrow(
      "Save a Gemini key in Settings → AI first"
    )
    expect((await rowOf(card.id)).status).toBe("saved")
  })

  it("queues once, however often it is pressed", async () => {
    vi.spyOn(keys, "getAiKey").mockResolvedValue("test-key")
    const card = await finishUpload(user.id, await insertMedia(user.id))
    expect((await analyseVideo(user.id, card.id)).status).toBe("queued")
    expect((await analyseVideo(user.id, card.id)).status).toBe("queued")
  })

  it("refuses Analyse while the link is still downloading", async () => {
    vi.spyOn(keys, "getAiKey").mockResolvedValue("test-key")
    const card = (await saveLink(user.id, YOUTUBE)).video
    await expect(analyseVideo(user.id, card.id)).rejects.toThrow(/finish saving/)
  })

  it("downloads a failed link again when it has no file", async () => {
    const card = (await saveLink(user.id, YOUTUBE)).video
    await database
      .update(noteVideos)
      .set({ status: "failed", error: "This post is private" })
      .where(eq(noteVideos.id, card.id))
    const retried = await retryVideo(user.id, card.id)
    expect(retried).toMatchObject({ status: "waiting", error: null })
  })

  it("analyses a failed video again when its file is still there", async () => {
    vi.spyOn(keys, "getAiKey").mockResolvedValue("test-key")
    const card = await finishUpload(user.id, await insertMedia(user.id))
    await database
      .update(noteVideos)
      .set({ status: "failed", error: "Summarising came back empty" })
      .where(eq(noteVideos.id, card.id))
    expect((await retryVideo(user.id, card.id)).status).toBe("queued")
  })

  it("says the file has gone, rather than to wait, when it was deleted after saving", async () => {
    vi.spyOn(keys, "getAiKey").mockResolvedValue("test-key")
    const card = (await saveLink(user.id, YOUTUBE)).video
    await database.update(noteVideos).set({ status: "saved" }).where(eq(noteVideos.id, card.id))
    await expect(analyseVideo(user.id, card.id)).rejects.toThrow(/saved file has gone/)
  })

  it("says to upload it again when an upload has no file left", async () => {
    const card = await finishUpload(user.id, await insertMedia(user.id))
    await database
      .update(noteVideos)
      .set({ status: "failed", mediaId: null, error: "Longer than 30 minutes" })
      .where(eq(noteVideos.id, card.id))
    await expect(retryVideo(user.id, card.id)).rejects.toThrow(/Upload it again/)
  })

  it("will not touch somebody else's video", async () => {
    const other = await insertUser(database)
    const theirs = (await saveLink(other.id, YOUTUBE)).video
    await database.update(noteVideos).set({ status: "failed" }).where(eq(noteVideos.id, theirs.id))
    await expect(retryVideo(user.id, theirs.id)).rejects.toThrow("Video not found")
    await expect(loadVideo(user.id, theirs.id)).rejects.toThrow("Video not found")
    await expect(deleteVideo(user.id, theirs.id)).rejects.toThrow("Video not found")
    await expect(saveNote(user.id, theirs.id, "mine now")).rejects.toThrow("Video not found")
  })
})

describe("the action plan and the note", () => {
  async function analysedVideo() {
    const card = await finishUpload(user.id, await insertMedia(user.id))
    await database
      .update(noteVideos)
      .set({
        status: "ready",
        actionPlan: [
          { text: "Write the result down.", done: false },
          { text: "Raise the price.", done: false },
        ],
      })
      .where(eq(noteVideos.id, card.id))
    return card.id
  }

  it("saves one tick at a time, and the card is Done once every step is", async () => {
    const id = await analysedVideo()
    expect((await tickStep(user.id, id, 0, true)).done).toBe(false)
    expect((await tickStep(user.id, id, 1, true)).done).toBe(true)
    expect((await rowOf(id)).actionPlan).toEqual([
      { text: "Write the result down.", done: true },
      { text: "Raise the price.", done: true },
    ])
    expect((await tickStep(user.id, id, 0, false)).done).toBe(false)
  })

  it("refuses a step that is not on the plan", async () => {
    const id = await analysedVideo()
    await expect(tickStep(user.id, id, 5, true)).rejects.toThrow(/not on the plan/)
  })

  it("shows the first line of the note on the card", async () => {
    const id = await analysedVideo()
    const card = await saveNote(user.id, id, "\nfor the course launch\nand the newsletter")
    expect(card.noteFirstLine).toBe("for the course launch")
  })
})

describe("deleting", () => {
  it("removes the file, the cover, the library row and the video row, in that order", async () => {
    const removed = vi.mocked(storage.deleteFromR2)
    const mediaId = await insertMedia(user.id)
    const card = await finishUpload(user.id, mediaId)
    await database
      .update(noteVideos)
      .set({ coverStoragePath: `note-covers/${user.id}/${card.id}.jpg` })
      .where(eq(noteVideos.id, card.id))

    await deleteVideo(user.id, card.id)

    expect(removed.mock.calls.map(([path]) => path)).toEqual([
      `${user.id}/${mediaId}.mp4`,
      `note-covers/${user.id}/${card.id}.jpg`,
    ])
    expect(await database.select().from(customShellMedia).where(eq(customShellMedia.id, mediaId))).toEqual([])
    expect(await rowOf(card.id)).toBeUndefined()
  })

  it("keeps a file a sent newsletter carries, and still removes the video", async () => {
    const removed = vi.mocked(storage.deleteFromR2)
    const mediaId = await insertMedia(user.id, { emailProtectedAt: now() })
    const card = await finishUpload(user.id, mediaId)

    await deleteVideo(user.id, card.id)

    expect(removed).not.toHaveBeenCalled()
    expect(await database.select().from(customShellMedia).where(eq(customShellMedia.id, mediaId))).toHaveLength(1)
    expect(await rowOf(card.id)).toBeUndefined()
  })

  it("keeps both rows when the file cannot be removed", async () => {
    vi.mocked(storage.deleteFromR2).mockRejectedValueOnce(new Error("bucket down"))
    const mediaId = await insertMedia(user.id)
    const card = await finishUpload(user.id, mediaId)
    await expect(deleteVideo(user.id, card.id)).rejects.toThrow("bucket down")
    expect(await rowOf(card.id)).toBeDefined()
  })
})

describe("moving", () => {
  it("refuses a folder that belongs to somebody else", async () => {
    const other = await insertUser(database)
    const theirFolder = (await createFolder(other.id, "Theirs")).folders[0].id
    const card = (await saveLink(user.id, YOUTUBE)).video
    await expect(moveVideo(user.id, card.id, theirFolder)).rejects.toThrow("Folder not found")
  })
})
