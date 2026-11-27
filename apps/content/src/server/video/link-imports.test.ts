import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { type CustomShellDb } from "@/server/db"
import { customShellMedia, type CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser, insertWorkspace } from "@/server/test-support"
import {
  claimLinkImports,
  importedFileName,
  importErrorMessage,
  LINK_IMPORT_PER_PERSON,
  LINK_IMPORT_RUNNING,
  listLinkImports,
  removeLinkImport,
  retryLinkImport,
  runLinkImport,
  startLinkImports,
} from "@/server/video/link-imports"
import { createOwnedCollection } from "@/server/video/media-collections"
import { listVideoMedia } from "@/server/video/media-list"
import { createOwnedProject } from "@/server/video/projects"
import {
  videoLinkImports,
  videoMediaCollectionItems,
  videoProjectMedia,
} from "@/server/video/schema"
import * as download from "@/server/video/viral/download"
import {
  LINK_IMPORT_ALREADY_HERE,
  LINK_IMPORT_BAD_LINK,
  LINK_IMPORT_TOO_BIG,
  LINK_IMPORT_TOO_MANY,
} from "@/lib/video/link-imports"

/**
 * Import from a link: what a paste starts and refuses, the worker's claim
 * limits, and a download landing on the project's shelf. yt-dlp and the
 * bucket are stood in for, so nothing here touches the network.
 */

const FILE_BYTES = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112])
const TIKTOK = "https://www.tiktok.com/@creator/video/7312345678901234567"
const REEL = "https://www.instagram.com/reel/C1abcDEF234/"
const SHORT = "https://www.youtube.com/shorts/dQw4w9WgXcQ"

const workspace = vi.hoisted(() => ({ id: "" }))

vi.mock("@/server/media/storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/media/storage")>()),
  uploadToR2: async () => undefined,
  deleteFromR2: async () => undefined,
  getPublicMediaUrl: async (path: string) => `https://media.test/${path}`,
}))

// A library row written the way a real download lands, without the shell's
// file checks, which want a real video.
vi.mock("@/server/video/asset-factories/media", async () => {
  const dbModule = await import("@/server/db")
  const { customShellMedia: media } = await import("@/server/schema")
  const { eq: equals } = await import("drizzle-orm")
  return {
    saveGeneratedAsset: async (options: { userId: string; bytes: Uint8Array; mimeType: string; name: string }) => {
      const id = crypto.randomUUID()
      const at = new Date()
      const [row] = await dbModule.db
        .insert(media)
        .values({
          id,
          workspaceId: workspace.id,
          userId: options.userId,
          filename: `${id}.mp4`,
          originalName: `${options.name}.mp4`,
          fileSize: options.bytes.byteLength,
          mimeType: options.mimeType,
          fileType: "video",
          storagePath: `${options.userId}/${id}.mp4`,
          createdAt: at,
          updatedAt: at,
        })
        .returning()
      return row
    },
    discardGeneratedAsset: async (asset: { id: string }) => {
      await dbModule.db.delete(media).where(equals(media.id, asset.id))
    },
  }
})

let client: PGlite
let database: CustomShellDb
let user: CustomShellUser
let projectId: string

function downloaded(overrides: Partial<download.DownloadedVideo> = {}): download.DownloadedVideo {
  return {
    bytes: FILE_BYTES,
    mimeType: "video/mp4",
    platformVideoId: "7312345678901234567",
    title: "Best pasta in Toronto #food #fyp",
    channelName: "creator",
    channelId: "@creator",
    subscribers: null,
    durationSeconds: 12,
    views: null,
    likes: null,
    comments: null,
    postedAt: null,
    ...overrides,
  }
}

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  user = await insertUser(database)
  workspace.id = (await insertWorkspace(database, { userId: user.id })).id
  projectId = (await createOwnedProject(user.id, "Project", database)).project.id
  vi.spyOn(download, "downloadViralVideo").mockResolvedValue(downloaded())
})

afterEach(async () => {
  await client.close()
  vi.restoreAllMocks()
})

async function runAll() {
  for (const job of await claimLinkImports()) await runLinkImport(job)
}

describe("pasting links", () => {
  it("starts each good line and names each refused one with its reason", async () => {
    const result = await startLinkImports(
      user.id,
      projectId,
      `${TIKTOK}\n\nhttps://example.com/video.mp4\n${REEL}\n${SHORT}\n${TIKTOK}`,
      null
    )
    expect(result.started).toBe(3)
    expect(result.skipped).toEqual([
      { link: "https://example.com/video.mp4", reason: LINK_IMPORT_BAD_LINK },
    ])
    const waiting = await listLinkImports(user.id, projectId)
    expect(waiting.map((item) => item.platform).sort()).toEqual(["instagram", "tiktok", "youtube"])
    expect(waiting.every((item) => item.status === "waiting")).toBe(true)
  })

  it("refuses an address on any other host before anything is queued", async () => {
    const result = await startLinkImports(user.id, projectId, "http://169.254.169.254/latest", null)
    expect(result.started).toBe(0)
    expect(await database.select().from(videoLinkImports)).toHaveLength(0)
  })

  it("refuses more than 20 links in one paste", async () => {
    const lines = Array.from({ length: 21 }, (_, index) => `https://www.youtube.com/shorts/abc${index}`)
    await expect(startLinkImports(user.id, projectId, lines.join("\n"), null)).rejects.toThrow(
      LINK_IMPORT_TOO_MANY
    )
  })

  it("skips a video already in the project, even under another address", async () => {
    await startLinkImports(user.id, projectId, SHORT, null)
    const again = await startLinkImports(user.id, projectId, "https://youtu.be/dQw4w9WgXcQ", null)
    expect(again.started).toBe(0)
    expect(again.skipped[0]?.reason).toBe(LINK_IMPORT_ALREADY_HERE)
  })

  it("starts a failed video again when it is pasted again", async () => {
    vi.mocked(download.downloadViralVideo).mockRejectedValueOnce(
      new Error("The video could not be downloaded: ERROR: [TikTok] 1: This post is private")
    )
    await startLinkImports(user.id, projectId, TIKTOK, null)
    await runAll()
    expect((await listLinkImports(user.id, projectId))[0]?.status).toBe("failed")
    const again = await startLinkImports(user.id, projectId, TIKTOK, null)
    expect(again.started).toBe(1)
    expect((await listLinkImports(user.id, projectId))[0]?.status).toBe("waiting")
  })

  it("will not paste into somebody else's project or collection", async () => {
    const other = await insertUser(database)
    await expect(startLinkImports(other.id, projectId, TIKTOK, null)).rejects.toThrow()
    const theirs = await createOwnedCollection(other.id, "Theirs", database)
    await expect(startLinkImports(user.id, projectId, TIKTOK, theirs.id)).rejects.toThrow()
  })
})

describe("the worker", () => {
  it("lands the file on the project's shelf and in the collection picked", async () => {
    const collection = await createOwnedCollection(user.id, "B-roll", database)
    await startLinkImports(user.id, projectId, TIKTOK, collection.id)
    await runAll()

    const [row] = await database.select().from(videoLinkImports)
    expect(row?.status).toBe("done")
    expect(row?.handle).toBe("@creator")
    const shelf = await database.select().from(videoProjectMedia).where(eq(videoProjectMedia.projectId, projectId))
    expect(shelf.map((item) => item.mediaId)).toEqual([row?.mediaId])
    const inCollection = await database
      .select()
      .from(videoMediaCollectionItems)
      .where(eq(videoMediaCollectionItems.collectionId, collection.id))
    expect(inCollection).toHaveLength(1)

    const [media] = await database.select().from(customShellMedia).where(eq(customShellMedia.id, row!.mediaId!))
    expect(media?.originalName).toBe("Best pasta in Toronto.mp4")

    const list = await listVideoMedia({ userId: user.id, scope: { type: "project", id: projectId }, database })
    expect(list.media[0]?.link_source).toEqual({ url: TIKTOK, handle: "@creator" })
    expect(await listLinkImports(user.id, projectId)).toEqual([])
  })

  it("keeps a failure's reason in plain words, and Try again queues it", async () => {
    vi.mocked(download.downloadViralVideo).mockRejectedValueOnce(
      new Error("The video could not be downloaded. It may be larger than 100MB.")
    )
    await startLinkImports(user.id, projectId, SHORT, null)
    await runAll()
    const [failed] = await listLinkImports(user.id, projectId)
    expect(failed?.error).toBe(LINK_IMPORT_TOO_BIG)
    await retryLinkImport(user.id, failed!.id)
    expect((await listLinkImports(user.id, projectId))[0]?.status).toBe("waiting")
  })

  it("throws the file away when the tile was removed mid-download", async () => {
    await startLinkImports(user.id, projectId, TIKTOK, null)
    const [job] = await claimLinkImports()
    await removeLinkImport(user.id, job!.id)
    await runLinkImport(job!)
    expect(await database.select().from(customShellMedia)).toHaveLength(0)
    expect(await database.select().from(videoProjectMedia)).toHaveLength(0)
  })

  it("fails a short link whose real video is already in the project", async () => {
    await startLinkImports(user.id, projectId, TIKTOK, null)
    await runAll()
    await startLinkImports(user.id, projectId, "https://vm.tiktok.com/ZMabc123/", null)
    await runAll()
    const [twin] = await listLinkImports(user.id, projectId)
    expect(twin?.status).toBe("failed")
    expect(twin?.error).toBe(LINK_IMPORT_ALREADY_HERE)
    expect(await database.select().from(customShellMedia)).toHaveLength(1)
  })

  it("puts a finished video back on the shelf without a second download", async () => {
    await startLinkImports(user.id, projectId, TIKTOK, null)
    await runAll()
    await database.delete(videoProjectMedia)
    const again = await startLinkImports(user.id, projectId, TIKTOK, null)
    expect(again.started).toBe(1)
    expect(await database.select().from(videoProjectMedia)).toHaveLength(1)
    expect(download.downloadViralVideo).toHaveBeenCalledTimes(1)
  })

  it("runs at most four at once, and five per person", async () => {
    const lines = Array.from({ length: 7 }, (_, index) => `https://www.youtube.com/shorts/clip${index}`)
    await startLinkImports(user.id, projectId, lines.join("\n"), null)
    expect(await claimLinkImports()).toHaveLength(LINK_IMPORT_RUNNING)
    expect(await claimLinkImports()).toHaveLength(0)
    expect(LINK_IMPORT_PER_PERSON).toBeGreaterThanOrEqual(LINK_IMPORT_RUNNING)
  })

  it("lets a deleted file be imported again", async () => {
    await startLinkImports(user.id, projectId, TIKTOK, null)
    await runAll()
    await database.delete(customShellMedia)
    expect(await database.select().from(videoLinkImports)).toHaveLength(0)
    expect((await startLinkImports(user.id, projectId, TIKTOK, null)).started).toBe(1)
  })
})

describe("names and reasons", () => {
  it("names a file after the post, without its hashtags", () => {
    expect(importedFileName("tiktok", "Best pasta 🍝 #food #fyp", new Date())).toBe("Best pasta")
    expect(importedFileName("youtube", "Nature’s Magic | Time-Lapse", new Date())).toBe("Natures Magic Time-Lapse")
  })

  it("names a file with no title after the platform and the day", () => {
    expect(importedFileName("instagram", "#fyp", new Date("2026-11-18T10:00:00Z"))).toBe("Instagram 18 Nov")
  })

  it("says why in plain words", () => {
    expect(importErrorMessage(new Error("ERROR: [Instagram] x: login required"))).toMatch(/sign-in/)
    expect(importErrorMessage(new Error("ERROR: [youtube] x: Video unavailable"))).toBe(
      "This post is gone or can't be watched."
    )
  })
})
