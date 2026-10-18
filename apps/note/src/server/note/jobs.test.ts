import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { now, uuid } from "@/server/auth/security"
import { type CustomShellDb } from "@/server/db"
import * as storage from "@/server/media/storage"
import {
  customShellMedia,
  customShellNotifications,
  type CustomShellUser,
} from "@/server/schema"
import { createTestDatabase, insertUser, insertWorkspace } from "@/server/test-support"
import * as analysis from "@/server/note/analysis"
import * as download from "@/server/note/download"
import * as files from "@/server/note/files"
import * as gemini from "@/server/note/gemini"
import { claimWaiting, failureWords, releaseAbandoned, runNext, tick } from "@/server/note/jobs"
import { SayableError } from "@/server/note/sayable"
import { noteNoticeLinks, noteVideos } from "@/server/note/schema"
import { retryVideo } from "@/server/note/videos"

/**
 * The worker's own rules, which are what make closing the browser harmless: a
 * claim is one worker's, a restart puts an interrupted job back, a failure
 * keeps its reason, and a link that turns out to be a video saved before is
 * folded into it. yt-dlp, the bucket, ffmpeg and Gemini are all stood in for,
 * so nothing here touches the network.
 */

let client: PGlite
let database: CustomShellDb
let user: CustomShellUser
let workspaceId: string

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  user = await insertUser(database)
  workspaceId = (await insertWorkspace(database)).id
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

async function insertVideo(values: Partial<typeof noteVideos.$inferInsert> = {}) {
  const at = now()
  const [row] = await database
    .insert(noteVideos)
    .values({
      id: uuid(),
      ownerId: user.id,
      source: "youtube",
      sourceUrl: "https://youtu.be/dQw4w9WgXcQ",
      platformVideoId: "dQw4w9WgXcQ",
      kind: "video",
      status: "waiting",
      createdAt: at,
      updatedAt: at,
      ...values,
    })
    .returning()
  return row
}

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
  const [row] = await database.select().from(noteVideos).where(eq(noteVideos.id, id))
  return row
}

async function notices() {
  return database
    .select({
      message: customShellNotifications.message,
      detail: customShellNotifications.detail,
      videoId: noteNoticeLinks.videoId,
    })
    .from(customShellNotifications)
    .leftJoin(noteNoticeLinks, eq(noteNoticeLinks.noticeId, customShellNotifications.id))
    .where(eq(customShellNotifications.recipientUserId, user.id))
}

async function downloaded(overrides: Partial<download.DownloadedVideo> = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), "note-test-"))
  const filePath = path.join(dir, "video.mp4")
  await writeFile(filePath, "not really a video")
  return {
    dir,
    filePath,
    mimeType: "video/mp4",
    kind: "video" as const,
    sizeBytes: 18,
    source: "youtube",
    platformVideoId: "dQw4w9WgXcQ",
    title: "How to price your product",
    channelName: "Some channel",
    durationSeconds: 720,
    postedAt: new Date("2026-10-01T00:00:00Z"),
    ...overrides,
  }
}

describe("claims and leases", () => {
  it("lets one worker claim a waiting video, and only one", async () => {
    const video = await insertVideo()
    const claimed = await claimWaiting()
    expect(claimed?.id).toBe(video.id)
    expect(claimed?.status).toBe("downloading")
    expect(claimed?.leaseToken).toBeTruthy()
    expect(await claimWaiting()).toBeNull()
  })

  it("puts a download a restart interrupted back to waiting", async () => {
    const video = await insertVideo({
      status: "downloading",
      leaseToken: uuid(),
      leaseExpiresAt: new Date(Date.now() - 60_000),
    })
    await releaseAbandoned()
    expect(await rowOf(video.id)).toMatchObject({ status: "waiting", leaseToken: null })
  })

  it("puts an analysis a restart interrupted back in the queue", async () => {
    const video = await insertVideo({
      status: "summarising",
      leaseToken: uuid(),
      leaseExpiresAt: new Date(Date.now() - 60_000),
    })
    await releaseAbandoned()
    expect(await rowOf(video.id)).toMatchObject({ status: "queued", leaseToken: null })
  })

  it("leaves a job alone while its lease is still good", async () => {
    const token = uuid()
    const video = await insertVideo({
      status: "transcribing",
      leaseToken: token,
      leaseExpiresAt: new Date(Date.now() + 5 * 60_000),
    })
    await releaseAbandoned()
    expect(await rowOf(video.id)).toMatchObject({ status: "transcribing", leaseToken: token })
  })
})

describe("the tick", () => {
  it("starts a job and returns without waiting for it, and starts no second one meanwhile", async () => {
    const video = await insertVideo()
    const second = await insertVideo({
      sourceUrl: "https://youtu.be/abcdefghijk",
      platformVideoId: "abcdefghijk",
    })
    let finish: (value: download.DownloadedVideo) => void = () => undefined
    vi.mocked(download.downloadVideo).mockImplementation(
      () => new Promise((resolve) => (finish = resolve))
    )
    vi.spyOn(files, "storeFile").mockResolvedValue(await insertMedia())
    vi.spyOn(files, "lookAtFile").mockResolvedValue({ coverStoragePath: null, durationSeconds: 60 })

    await tick()
    await vi.waitFor(() => expect(download.downloadVideo).toHaveBeenCalledTimes(1))
    await tick()

    expect(download.downloadVideo).toHaveBeenCalledTimes(1)
    expect((await rowOf(second.id)).status).toBe("waiting")
    finish(await downloaded())
    await vi.waitFor(async () => expect((await rowOf(video.id)).status).toBe("saved"))
  })
})

describe("what a failure says", () => {
  it("keeps the server's own errors off the card", () => {
    expect(failureWords(new Error('Failed query: update "note_videos" set ...'))).toBe(
      "Something went wrong on the server. Try again."
    )
    expect(failureWords(new SayableError("This post is private"))).toBe("This post is private")
    expect(failureWords(new Error("Longer than 30 minutes"))).toBe("Longer than 30 minutes")
  })
})

describe("downloading a link", () => {
  it("stores the file, takes a cover and says it is ready to analyse", async () => {
    const video = await insertVideo()
    const media = await insertMedia()
    vi.mocked(download.downloadVideo).mockResolvedValue(await downloaded())
    vi.spyOn(files, "storeFile").mockResolvedValue(media)
    vi.spyOn(files, "lookAtFile").mockResolvedValue({
      coverStoragePath: `note-covers/${user.id}/${video.id}.jpg`,
      durationSeconds: 721,
    })

    await runNext()

    expect(await rowOf(video.id)).toMatchObject({
      status: "saved",
      mediaId: media.id,
      coverStoragePath: `note-covers/${user.id}/${video.id}.jpg`,
      title: "How to price your product",
      channelName: "Some channel",
      durationSeconds: 720,
      leaseToken: null,
      error: null,
    })
    expect(await notices()).toEqual([
      { message: "Ready to analyse: How to price your product", detail: null, videoId: video.id },
    ])
  })

  it("keeps yt-dlp's own reason on a failed row and says so in the bell", async () => {
    const video = await insertVideo()
    await runNext()
    expect(await rowOf(video.id)).toMatchObject({
      status: "failed",
      error: "This post is private",
      leaseToken: null,
    })
    expect(await notices()).toEqual([
      { message: "Failed: youtu.be", detail: "This post is private", videoId: video.id },
    ])
  })

  it("refuses a video ffmpeg finds is over 30 minutes, and deletes its file", async () => {
    const video = await insertVideo()
    const media = await insertMedia()
    vi.mocked(download.downloadVideo).mockResolvedValue(await downloaded({ durationSeconds: null }))
    vi.spyOn(files, "storeFile").mockResolvedValue(media)
    vi.spyOn(files, "lookAtFile").mockResolvedValue({ coverStoragePath: null, durationSeconds: 2400 })

    await runNext()

    expect(await rowOf(video.id)).toMatchObject({
      status: "failed",
      error: "Longer than 30 minutes",
      mediaId: null,
    })
    expect(files.discardFile).toHaveBeenCalledWith(media)
  })

  it("folds a link from anywhere else into the same video saved before", async () => {
    const earlier = await insertVideo({
      source: "vimeo",
      sourceUrl: "https://vimeo.com/76979871",
      platformVideoId: "76979871",
      status: "ready",
    })
    const again = await insertVideo({
      source: "web",
      sourceUrl: "https://player.vimeo.com/video/76979871",
      platformVideoId: null,
    })
    vi.mocked(download.downloadVideo).mockResolvedValue(
      await downloaded({ source: "vimeo", platformVideoId: "76979871" })
    )
    const stored = vi.spyOn(files, "storeFile")

    await runNext()

    expect(await rowOf(again.id)).toBeUndefined()
    expect(await rowOf(earlier.id)).toMatchObject({ status: "ready" })
    expect(stored).not.toHaveBeenCalled()
  })

  it("names a link from anywhere else after the site yt-dlp read it from", async () => {
    const video = await insertVideo({
      source: "web",
      sourceUrl: "https://vimeo.com/76979871",
      platformVideoId: null,
    })
    const media = await insertMedia()
    vi.mocked(download.downloadVideo).mockResolvedValue(
      await downloaded({ source: "vimeo", platformVideoId: "76979871" })
    )
    vi.spyOn(files, "storeFile").mockResolvedValue(media)
    vi.spyOn(files, "lookAtFile").mockResolvedValue({ coverStoragePath: null, durationSeconds: 60 })

    await runNext()

    expect(await rowOf(video.id)).toMatchObject({
      status: "saved",
      source: "vimeo",
      platformVideoId: "76979871",
    })
  })

  it("never folds a plain page, whose id is only the end of its address", async () => {
    const video = await insertVideo({
      source: "web",
      sourceUrl: "https://b.example.org/course/intro",
      platformVideoId: null,
    })
    const media = await insertMedia()
    vi.mocked(download.downloadVideo).mockResolvedValue(
      await downloaded({ source: "generic", platformVideoId: "intro", title: "Intro" })
    )
    vi.spyOn(files, "storeFile").mockResolvedValue(media)
    vi.spyOn(files, "lookAtFile").mockResolvedValue({ coverStoragePath: null, durationSeconds: 60 })

    await runNext()

    expect(await rowOf(video.id)).toMatchObject({
      status: "saved",
      source: "web",
      platformVideoId: null,
    })
  })

  it("throws the file away when the video was deleted mid-download", async () => {
    const video = await insertVideo()
    const media = await insertMedia()
    vi.mocked(download.downloadVideo).mockResolvedValue(await downloaded())
    vi.spyOn(files, "storeFile").mockResolvedValue(media)
    vi.spyOn(files, "lookAtFile").mockImplementation(async () => {
      await database.delete(noteVideos).where(eq(noteVideos.id, video.id))
      return { coverStoragePath: `note-covers/${user.id}/${video.id}.jpg`, durationSeconds: 60 }
    })

    await runNext()

    expect(files.discardFile).toHaveBeenCalledWith(media)
    expect(storage.deleteFromR2).toHaveBeenCalledWith(`note-covers/${user.id}/${video.id}.jpg`)
    expect(await notices()).toEqual([])
  })
})

describe("looking at an upload", () => {
  async function unreadUpload() {
    const media = await insertMedia()
    vi.spyOn(files, "downloadToFile").mockResolvedValue(undefined)
    return insertVideo({
      source: "upload",
      sourceUrl: null,
      platformVideoId: null,
      status: "saved",
      mediaId: media.id,
      title: "Talk",
    })
  }

  it("takes the cover and the length", async () => {
    const video = await unreadUpload()
    vi.spyOn(files, "lookAtFile").mockResolvedValue({
      coverStoragePath: `note-covers/${user.id}/${video.id}.jpg`,
      durationSeconds: 95,
    })

    await runNext()

    expect(await rowOf(video.id)).toMatchObject({
      coverStoragePath: `note-covers/${user.id}/${video.id}.jpg`,
      durationSeconds: 95,
      leaseToken: null,
    })
    expect(await notices()).toEqual([])
  })

  it("deletes the cover it stored when the video was deleted meanwhile", async () => {
    const video = await unreadUpload()
    vi.spyOn(files, "lookAtFile").mockImplementation(async () => {
      await database.delete(noteVideos).where(eq(noteVideos.id, video.id))
      return { coverStoragePath: `note-covers/${user.id}/${video.id}.jpg`, durationSeconds: 95 }
    })

    await runNext()

    expect(storage.deleteFromR2).toHaveBeenCalledWith(`note-covers/${user.id}/${video.id}.jpg`)
  })

  it("still gives the cover to a video Analyse took over meanwhile", async () => {
    const video = await unreadUpload()
    vi.spyOn(files, "lookAtFile").mockImplementation(async () => {
      await database
        .update(noteVideos)
        .set({ status: "queued", leaseToken: null, leaseExpiresAt: null })
        .where(eq(noteVideos.id, video.id))
      return { coverStoragePath: `note-covers/${user.id}/${video.id}.jpg`, durationSeconds: 95 }
    })

    await runNext()

    expect(await rowOf(video.id)).toMatchObject({
      status: "queued",
      coverStoragePath: `note-covers/${user.id}/${video.id}.jpg`,
    })
    expect(storage.deleteFromR2).not.toHaveBeenCalled()
  })
})

describe("analysing", () => {
  async function queuedVideo() {
    const media = await insertMedia()
    const video = await insertVideo({
      status: "queued",
      mediaId: media.id,
      title: "How to price your product",
      durationSeconds: 60,
      summary: ["An old summary."],
    })
    vi.spyOn(gemini, "requireGeminiKey").mockResolvedValue("test-key")
    vi.spyOn(files, "downloadToFile").mockResolvedValue(undefined)
    vi.spyOn(files, "extractSound").mockImplementation(async (_source, soundPath) => {
      await writeFile(soundPath, "sound")
      return 60
    })
    vi.spyOn(files, "lookAtFile").mockResolvedValue({
      coverStoragePath: `note-covers/${user.id}/${video.id}.jpg`,
      durationSeconds: 60,
    })
    return video
  }

  it("takes the cover of an upload analysed before the worker looked at it", async () => {
    const video = await queuedVideo()
    vi.spyOn(analysis, "transcribe").mockResolvedValue({ language: "en", lines: [] })

    await runNext()

    expect(await rowOf(video.id)).toMatchObject({
      status: "ready",
      coverStoragePath: `note-covers/${user.id}/${video.id}.jpg`,
    })
  })

  it("writes the words, then the summary, plan, quotes and tags, and says so", async () => {
    const video = await queuedVideo()
    vi.spyOn(analysis, "transcribe").mockResolvedValue({
      language: "es",
      lines: [{ startMs: 0, endMs: 4000, text: "Hola a todos." }],
    })
    vi.spyOn(analysis, "summarise").mockResolvedValue({
      summary: ["A greeting."],
      actionPlan: [{ text: "Say hello.", done: false }],
      quotes: [{ text: "Hello everyone.", startMs: 0 }],
      tags: ["greetings"],
    })

    await runNext()

    const row = await rowOf(video.id)
    expect(row).toMatchObject({
      status: "ready",
      language: "es",
      transcriptText: "Hola a todos.",
      summary: ["A greeting."],
      actionPlan: [{ text: "Say hello.", done: false }],
      tags: ["greetings"],
      error: null,
      leaseToken: null,
    })
    expect(row.analysedAt).not.toBeNull()
    expect(await notices()).toEqual([
      { message: "Analysed: How to price your product", detail: null, videoId: video.id },
    ])
  })

  it("spends nothing on a summary when nobody speaks", async () => {
    const video = await queuedVideo()
    vi.spyOn(analysis, "transcribe").mockResolvedValue({ language: "en", lines: [] })
    const summarise = vi.spyOn(analysis, "summarise")

    await runNext()

    expect(summarise).not.toHaveBeenCalled()
    expect(await rowOf(video.id)).toMatchObject({ status: "ready", summary: [], actionPlan: [] })
  })

  it("keeps the file on a failure, so Try again goes straight back to the queue", async () => {
    const video = await queuedVideo()
    vi.spyOn(analysis, "transcribe").mockRejectedValue(
      new SayableError("Writing the words down failed (HTTP 500)")
    )

    await runNext()

    const row = await rowOf(video.id)
    expect(row).toMatchObject({
      status: "failed",
      error: "Writing the words down failed (HTTP 500)",
    })
    expect(row.mediaId).not.toBeNull()
    expect(await notices()).toEqual([
      {
        message: "Failed: How to price your product",
        detail: "Writing the words down failed (HTTP 500)",
        videoId: video.id,
      },
    ])

    vi.spyOn(await import("@/server/ai/keys"), "getAiKey").mockResolvedValue("test-key")
    expect((await retryVideo(user.id, video.id)).status).toBe("queued")
  })

  it("says the monthly allowance is used up in words", async () => {
    const video = await queuedVideo()
    vi.spyOn(analysis, "transcribe").mockRejectedValue(new Error("AI_LIMIT_REACHED"))

    await runNext()

    expect((await rowOf(video.id)).error).toBe(
      "This month's AI allowance is used up. It starts fresh on the 1st."
    )
  })

  it("drops its answer when another worker took the video over", async () => {
    const video = await queuedVideo()
    const takenBy = uuid()
    vi.spyOn(analysis, "transcribe").mockImplementation(async () => {
      await database
        .update(noteVideos)
        .set({ leaseToken: takenBy })
        .where(eq(noteVideos.id, video.id))
      return { language: "en", lines: [{ startMs: 0, endMs: 1000, text: "Hi." }] }
    })

    await runNext()

    expect(await rowOf(video.id)).toMatchObject({
      status: "transcribing",
      leaseToken: takenBy,
      transcript: null,
    })
    expect(await notices()).toEqual([])
  })
})
