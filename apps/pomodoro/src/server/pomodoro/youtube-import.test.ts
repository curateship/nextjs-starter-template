import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Files never really leave for the bucket in a test.
vi.mock("@/server/media/storage", () => ({
  deleteFromR2: vi.fn(async () => undefined),
  uploadToR2: vi.fn(async () => undefined),
  getPublicMediaUrl: vi.fn(async (path: string) => `https://files.test/${path}`),
  getFromR2: vi.fn(),
  R2StorageNotConfiguredError: class extends Error {},
}))

// FFmpeg never runs in a test: a film comes back as it went in, and the
// still is a stub, so the test can tell whether a film was re-encoded.
vi.mock("@/server/pomodoro/media-transcode", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/pomodoro/media-transcode")>()),
  transcodeUpload: vi.fn(async () => ({ bytes: new Uint8Array([9]), mimeType: "video/mp4", extension: "mp4" })),
  extractMiddleFrame: vi.fn(async () => new Uint8Array([0xff, 0xd8, 0xff])),
}))

// YouTube is never asked in a test: the download is a stub.
vi.mock("@/server/pomodoro/youtube-clip", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/pomodoro/youtube-clip")>()),
  downloadYoutubeClip: vi.fn(),
}))

import { type CustomShellDb } from "@/server/db"
import { deleteFromR2, getFromR2, uploadToR2 } from "@/server/media/storage"
import { processNextCatalogFile } from "@/server/pomodoro/catalog-worker"
import { transcodeUpload } from "@/server/pomodoro/media-transcode"
import { forgetMediaCatalog } from "@/server/pomodoro/catalog"
import { processPixabayImports } from "@/server/pomodoro/pixabay-worker"
import { pomodoroAuditLogs, pomodoroCatalogItems } from "@/server/pomodoro/schema"
import {
  downloadYoutubeClip,
  YoutubeClipRefusedError,
} from "@/server/pomodoro/youtube-clip"
import { importThemeFromYoutube } from "@/server/pomodoro/youtube-import"
import { processYoutubeImports } from "@/server/pomodoro/youtube-worker"
import { createTestDatabase, insertUser } from "@/server/test-support"

/**
 * "Make a theme from a YouTube clip" against a real database, with the
 * yt-dlp download stubbed, so no request leaves the machine.
 */

let client: PGlite
let db: CustomShellDb
let admin: string

const LINK = "https://youtu.be/aqz-KE-bpKQ"
const ADDRESS = "https://www.youtube.com/watch?v=aqz-KE-bpKQ&t=95"
const MP4 = new Uint8Array([0, 0, 0, 0x18, ...[..."ftypmp42"].map((c) => c.charCodeAt(0)), 0, 0, 0, 0])

beforeEach(async () => {
  ;({ client, db } = await createTestDatabase())
  forgetMediaCatalog()
  admin = (await insertUser(db, { role: "admin" })).id
  vi.mocked(uploadToR2).mockClear()
  vi.mocked(deleteFromR2).mockClear()
  vi.mocked(downloadYoutubeClip).mockReset()
})

afterEach(async () => {
  vi.restoreAllMocks()
  await client.close()
})

async function onlyRow() {
  const rows = await db.select().from(pomodoroCatalogItems).where(eq(pomodoroCatalogItems.licenceNote, "From YouTube"))
  expect(rows).toHaveLength(1)
  return rows[0]
}

describe("making the Draft", () => {
  it("makes one Draft theme waiting for its clip, with the licence left for the admin to set", async () => {
    expect(await importThemeFromYoutube({ link: LINK, start: "1:35", actorUserId: admin })).toEqual({ ok: true })

    const row = await onlyRow()
    expect(row).toMatchObject({
      kind: "theme",
      label: "YouTube clip",
      descriptor: "video",
      status: "draft",
      sourceUrl: ADDRESS,
      importUrl: ADDRESS,
      licence: "other",
      fileStatus: "queued",
      sourceKind: "video",
      sourcePath: null,
    })
    const audit = await db.select().from(pomodoroAuditLogs).where(eq(pomodoroAuditLogs.action, "catalog_import"))
    expect(audit.map((entry) => entry.recordIds)).toEqual([[row.id]])
  })

  it("refuses the same stretch twice, but lets another start of the same video through", async () => {
    await importThemeFromYoutube({ link: LINK, start: "95", actorUserId: admin })
    expect(await importThemeFromYoutube({ link: `${LINK}?t=95`, start: "", actorUserId: admin })).toEqual({
      ok: false,
      field: "link",
      reason: "That stretch is already in the catalogue as YouTube clip.",
    })
    expect(await importThemeFromYoutube({ link: LINK, start: "2:00", actorUserId: admin })).toEqual({ ok: true })
  })

  it("reads the fields again and inserts nothing for a bad one", async () => {
    expect(await importThemeFromYoutube({ link: "https://vimeo.com/1", start: "", actorUserId: admin })).toMatchObject({
      ok: false,
      field: "link",
    })
    expect(await importThemeFromYoutube({ link: LINK, start: "1:75", actorUserId: admin })).toMatchObject({
      ok: false,
      field: "start",
    })
    expect(await db.select().from(pomodoroCatalogItems).where(eq(pomodoroCatalogItems.licenceNote, "From YouTube"))).toEqual([])
  })
})

describe("the worker", () => {
  beforeEach(async () => {
    await importThemeFromYoutube({ link: LINK, start: "1:35", actorUserId: admin })
  })

  it("fetches the 5 seconds from the start asked for and hands the clip on with the video's title and channel", async () => {
    vi.mocked(downloadYoutubeClip).mockResolvedValue({
      bytes: MP4,
      title: "Big Buck Bunny 60fps 4K - Official Blender Foundation Short Film",
      channel: "Blender",
    })
    await processYoutubeImports()

    expect(downloadYoutubeClip).toHaveBeenCalledWith("aqz-KE-bpKQ", 95)
    const row = await onlyRow()
    expect(row).toMatchObject({
      label: "Big Buck Bunny 60fps 4K - Official Blender Foundation Short",
      artist: "Blender",
      importUrl: null,
      fileStatus: "queued",
      sourceKind: "video",
      attempts: 0,
      sourceUrl: ADDRESS,
      licence: "other",
    })
    expect(row.sourcePath).toMatch(/^pomodoro-catalog\/sources\/youtube-.+\.mp4$/)
    expect(uploadToR2).toHaveBeenCalledTimes(1)
  })

  it("keeps the clip at its own size, up to 4K, where an upload would be shrunk to 720p", async () => {
    vi.mocked(downloadYoutubeClip).mockResolvedValue({ bytes: MP4, title: "Bunny", channel: "Blender" })
    await processYoutubeImports()
    const handed = await onlyRow()
    vi.mocked(getFromR2).mockResolvedValue({
      Body: { transformToByteArray: async () => MP4 },
    } as unknown as Awaited<ReturnType<typeof getFromR2>>)
    vi.mocked(uploadToR2).mockClear()
    vi.mocked(transcodeUpload).mockClear()

    await processNextCatalogFile()

    expect(transcodeUpload).not.toHaveBeenCalled()
    const film = vi.mocked(uploadToR2).mock.calls.find(([path]) => path.startsWith("pomodoro-catalog/themes/") && path.endsWith(".mp4"))
    expect(film?.[1]).toEqual(MP4)
    const done = await onlyRow()
    expect(done).toMatchObject({ fileStatus: "ready", sourcePath: null })
    expect(done.fileUrl).toBe(`https://files.test/${film?.[0]}`)
    expect(handed.sourcePath).not.toBe(done.sourcePath)
  })

  it("still shrinks a film that did not come from YouTube", async () => {
    const waiting = await onlyRow()
    await db
      .update(pomodoroCatalogItems)
      .set({ importUrl: null, sourcePath: "pomodoro-catalog/sources/0d3c1a52-4f0e-4b5e-9a39-1f6f1c0d2b7a.mp4" })
      .where(eq(pomodoroCatalogItems.id, waiting.id))
    vi.mocked(getFromR2).mockResolvedValue({
      Body: { transformToByteArray: async () => MP4 },
    } as unknown as Awaited<ReturnType<typeof getFromR2>>)
    vi.mocked(transcodeUpload).mockClear()

    await processNextCatalogFile()

    expect(transcodeUpload).toHaveBeenCalledWith(MP4, "video")
  })

  it("keeps a name and artist the admin typed while the clip was on its way", async () => {
    const waiting = await onlyRow()
    await db
      .update(pomodoroCatalogItems)
      .set({ label: "Fireplace", artist: "Me" })
      .where(eq(pomodoroCatalogItems.id, waiting.id))
    vi.mocked(downloadYoutubeClip).mockResolvedValue({ bytes: MP4, title: "Some title", channel: "Someone" })
    await processYoutubeImports()

    expect(await onlyRow()).toMatchObject({ label: "Fireplace", artist: "Me", fileStatus: "queued" })
  })

  it("fails a refused video at once with the reason on the row", async () => {
    vi.mocked(downloadYoutubeClip).mockRejectedValue(
      new YoutubeClipRefusedError("The video is only 1:00 long, so the clip must start by 0:55.")
    )
    await processYoutubeImports()

    expect(await onlyRow()).toMatchObject({
      fileStatus: "failed",
      fileError: "The video is only 1:00 long, so the clip must start by 0:55.",
      importUrl: null,
    })
    expect(downloadYoutubeClip).toHaveBeenCalledTimes(1)
  })

  it("tries a broken download once a pass, three times, then gives up", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    vi.mocked(downloadYoutubeClip).mockRejectedValue(new Error("HTTP Error 403: Forbidden"))
    await processYoutubeImports()
    expect(await onlyRow()).toMatchObject({ fileStatus: "queued", attempts: 1 })
    await processYoutubeImports()
    await processYoutubeImports()

    expect(await onlyRow()).toMatchObject({
      fileStatus: "failed",
      fileError: "The YouTube clip could not be fetched",
    })
    expect(downloadYoutubeClip).toHaveBeenCalledTimes(3)
  })

  it("drops a clip whose row was deleted while it was fetching", async () => {
    const waiting = await onlyRow()
    vi.mocked(downloadYoutubeClip).mockImplementation(async () => {
      await db.delete(pomodoroCatalogItems).where(eq(pomodoroCatalogItems.id, waiting.id))
      return { bytes: MP4, title: null, channel: null }
    })
    await processYoutubeImports()

    expect(deleteFromR2).toHaveBeenCalledTimes(1)
  })

  it("is never taken by the Pixabay worker", async () => {
    await processPixabayImports()

    expect(await onlyRow()).toMatchObject({ fileStatus: "queued", attempts: 0, importUrl: ADDRESS })
  })
})
