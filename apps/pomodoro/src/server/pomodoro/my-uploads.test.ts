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

let workspaceId = ""
vi.mock("@/server/workspaces/for-request", () => ({
  workspaceIdForRequest: vi.fn(async () => workspaceId),
}))

// Every member here is Pro with 2 GB.
vi.mock("@/server/pomodoro/entitlements", () => ({
  loadPomodoroEntitlements: vi.fn(async () => ({
    canUploadMedia: true,
    storageLimitBytes: 2 * 1024 * 1024 * 1024,
  })),
}))

import { type CustomShellDb } from "@/server/db"
import { now, uuid } from "@/server/auth/security"
import { deleteFromR2 } from "@/server/media/storage"
import { deleteAdminUploads } from "@/server/pomodoro/admin-uploads"
import {
  claimNextUploadJob,
  deletePomodoroUpload,
  editPomodoroUpload,
  finishUploadJob,
  listPomodoroUploads,
  loadJobFile,
  loadUploadDownload,
  resolveUploadUrl,
  storePomodoroUpload,
} from "@/server/pomodoro/media-uploads"
import {
  emptyBin,
  moveUploadsToBin,
  purgeExpiredBin,
  restoreUploads,
} from "@/server/pomodoro/upload-bin"
import { checkStorageWarning } from "@/server/pomodoro/storage-warning"
import { drainBucketDeletions } from "@/server/pomodoro/bucket-cleanup"
import {
  pomodoroBucketDeletions,
  pomodoroGenerations,
  pomodoroMediaUploads,
  pomodoroPersonalRooms,
  pomodoroStorageWarnings,
} from "@/server/pomodoro/schema"
import {
  customShellMedia,
  customShellNotifications,
  customShellUsers,
} from "@/server/schema"
import { createTestDatabase, insertUser, insertWorkspace } from "@/server/test-support"

/**
 * My uploads (uploads-and-sharing task 02) against a real database: the bin,
 * the space warning, the marks on a card, a clip's still and the download.
 */

let client: PGlite
let db: CustomShellDb

beforeEach(async () => {
  ;({ client, db } = await createTestDatabase())
  workspaceId = (await insertWorkspace(db)).id
  vi.mocked(deleteFromR2).mockClear()
})

afterEach(async () => {
  await client.close()
})

function store(userId: string, kind: "image" | "video" = "image", name = "Rain") {
  return storePomodoroUpload({
    userId,
    purpose: "background",
    file: { name: kind === "image" ? "rain.png" : "rain.mp4" },
    bytes: new Uint8Array([1, 2, 3]),
    detected:
      kind === "image"
        ? { kind: "image", mimeType: "image/png" }
        : { kind: "video", mimeType: "video/mp4" },
    labels: { name, tags: [], shared: false, trim: null },
  })
}

async function names(userId: string, view: "background" | "bin") {
  return (await listPomodoroUploads(userId, view)).map((upload) => upload.name)
}

describe("the bin", () => {
  it("hides a file everywhere, frees its room choice, and brings it back", async () => {
    const userId = (await insertUser(db)).id
    const stranger = (await insertUser(db)).id
    const kept = await store(userId, "image", "Kept")
    const binned = await store(userId, "image", "Binned")
    await db.insert(pomodoroPersonalRooms).values({ userId, background: `media:${binned.mediaId}` })

    expect(await moveUploadsToBin(stranger, [binned.mediaId])).toEqual({ done: [], skipped: [binned.mediaId] })
    expect(await moveUploadsToBin(userId, [binned.mediaId])).toEqual({ done: [binned.mediaId], skipped: [] })

    expect(await names(userId, "background")).toEqual(["Kept"])
    expect(await names(userId, "bin")).toEqual(["Binned"])
    expect(await resolveUploadUrl(userId, binned.mediaId)).toBeNull()
    await expect(
      editPomodoroUpload(userId, binned.mediaId, { name: "x", tags: [], shared: false })
    ).rejects.toThrow("UPLOAD_NOT_FOUND")
    const [room] = await db.select().from(pomodoroPersonalRooms).where(eq(pomodoroPersonalRooms.userId, userId))
    expect(room.background).toBeNull()
    // The file is still there: rows and bucket alike.
    expect(deleteFromR2).not.toHaveBeenCalled()

    expect(await restoreUploads(userId, [binned.mediaId, kept.mediaId])).toEqual({
      done: [binned.mediaId],
      skipped: [kept.mediaId],
    })
    expect(await names(userId, "background")).toEqual(["Kept", "Binned"])
    // What it was used for does not come back with it.
    const [after] = await db.select().from(pomodoroPersonalRooms).where(eq(pomodoroPersonalRooms.userId, userId))
    expect(after.background).toBeNull()
  })

  it("leaves a sound or clip in the bin unprepared until it comes back", async () => {
    const userId = (await insertUser(db)).id
    const clip = await store(userId, "video")
    await moveUploadsToBin(userId, [clip.mediaId])
    expect(await claimNextUploadJob()).toBeNull()
    await restoreUploads(userId, [clip.mediaId])
    expect((await claimNextUploadJob())?.mediaId).toBe(clip.mediaId)
  })

  it("empties for good, and the worker removes only what has waited 30 days", async () => {
    const userId = (await insertUser(db)).id
    const old = await store(userId, "image", "Old")
    const fresh = await store(userId, "image", "Fresh")
    await moveUploadsToBin(userId, [old.mediaId, fresh.mediaId])
    await db
      .update(pomodoroMediaUploads)
      .set({ deletedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000) })
      .where(eq(pomodoroMediaUploads.mediaId, old.mediaId))

    expect(await purgeExpiredBin()).toBe(1)
    expect(await names(userId, "bin")).toEqual(["Fresh"])
    expect(deleteFromR2).toHaveBeenCalledTimes(1)

    expect(await emptyBin(userId)).toEqual({ deleted: 1, kept: 0 })
    expect(await names(userId, "bin")).toEqual([])
    const left = await db.select().from(customShellMedia).where(eq(customShellMedia.userId, userId))
    expect(left).toEqual([])
  })
})

describe("checkStorageWarning", () => {
  const GB = 1024 * 1024 * 1024

  async function takeSpace(userId: string, bytes: number) {
    const id = uuid()
    const timestamp = now()
    await db.insert(customShellMedia).values({
      id,
      workspaceId,
      userId,
      filename: `${id}.mp4`,
      originalName: "big.mp4",
      altText: null,
      fileSize: Math.round(bytes),
      mimeType: "video/mp4",
      fileType: "video",
      storagePath: `${userId}/${id}.mp4`,
      emailProtectedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    return id
  }

  async function warnings(userId: string) {
    return db
      .select({ message: customShellNotifications.message, detail: customShellNotifications.detail })
      .from(customShellNotifications)
      .where(eq(customShellNotifications.recipientUserId, userId))
  }

  it("warns once at 90%, and again only after dropping back under", async () => {
    const userId = (await insertUser(db)).id
    const first = await takeSpace(userId, 1.7 * GB)
    await checkStorageWarning(userId)
    expect(await warnings(userId)).toEqual([])

    await takeSpace(userId, 0.15 * GB)
    await checkStorageWarning(userId)
    await checkStorageWarning(userId)
    expect(await warnings(userId)).toEqual([
      { message: "Your space is nearly full.", detail: expect.stringMatching(/^1\.9 GB of 2\.0 GB used\./) },
    ])

    await db.delete(customShellMedia).where(eq(customShellMedia.id, first))
    await checkStorageWarning(userId)
    expect(await db.select().from(pomodoroStorageWarnings)).toEqual([])

    await takeSpace(userId, 1.7 * GB)
    await checkStorageWarning(userId)
    expect(await warnings(userId)).toHaveLength(2)
  })
})

describe("what a card shows", () => {
  it("marks a file made by AI and a file in use", async () => {
    const userId = (await insertUser(db)).id
    const made = await store(userId, "image", "Made")
    const used = await store(userId, "image", "Used")
    await db.insert(pomodoroGenerations).values({
      userId,
      kind: "background",
      prompt: "a rainy window",
      status: "ready",
      month: "2026-10-01",
      mediaId: made.mediaId,
    } as typeof pomodoroGenerations.$inferInsert)
    await db.insert(pomodoroPersonalRooms).values({ userId, background: `media:${used.mediaId}` })
    const listed = await listPomodoroUploads(userId, "background")
    expect(listed.map(({ name, generated, inUse }) => ({ name, generated, inUse }))).toEqual([
      { name: "Made", generated: true, inUse: false },
      { name: "Used", generated: false, inUse: true },
    ])
  })

  it("gives a clip the still its cut brought, and removes the old one with the next", async () => {
    const userId = (await insertUser(db)).id
    const clip = await store(userId, "video")
    for (const [cut, still] of [["cut-1.mp4", "still-1.jpg"], ["cut-2.mp4", "still-2.jpg"]]) {
      if (cut === "cut-2.mp4")
        await editPomodoroUpload(userId, clip.mediaId, { name: "Rain", tags: [], shared: false, trim: { startMs: 0, endMs: 2000 } })
      const job = await claimNextUploadJob()
      const file = await loadJobFile(clip.mediaId)
      await finishUploadJob({
        mediaId: clip.mediaId,
        claimedAt: job!.claimedAt,
        storagePath: `${userId}/${cut}`,
        mimeType: "video/mp4",
        fileSize: 2,
        previousStoragePath: file!.storagePath,
        stillPath: `pomodoro-stills/${userId}/${still}`,
      })
    }
    const [listed] = await listPomodoroUploads(userId, "background")
    expect(listed.stillUrl).toBe(`https://files.test/pomodoro-stills/${userId}/still-2.jpg`)
    // The replaced still is noted, and leaves the bucket on the worker's pass.
    vi.mocked(deleteFromR2).mockClear()
    expect(await drainBucketDeletions()).toBe(1)
    expect(vi.mocked(deleteFromR2).mock.calls).toEqual([[`pomodoro-stills/${userId}/still-1.jpg`]])
  })
})

describe("loadUploadDownload", () => {
  it("names the file after the upload, for its owner only, and never from the bin", async () => {
    const userId = (await insertUser(db)).id
    const stranger = (await insertUser(db)).id
    const picture = await store(userId, "image", "Rain on my window")
    expect(await loadUploadDownload(userId, picture.mediaId)).toMatchObject({
      filename: "Rain on my window.png",
      mimeType: "image/png",
    })
    expect(await loadUploadDownload(stranger, picture.mediaId)).toBeNull()
    await moveUploadsToBin(userId, [picture.mediaId])
    expect(await loadUploadDownload(userId, picture.mediaId)).toBeNull()
  })
})

describe("audit fixes", () => {
  it("never removes for good a file brought back while the bin was being emptied", async () => {
    const userId = (await insertUser(db)).id
    const file = await store(userId, "image", "Back again")
    await moveUploadsToBin(userId, [file.mediaId])
    // Brought back between the bin's list being read and its turn coming.
    await restoreUploads(userId, [file.mediaId])
    await expect(
      deletePomodoroUpload(userId, file.mediaId, { fromBin: true })
    ).rejects.toThrow("UPLOAD_NOT_FOUND")
    expect(await names(userId, "background")).toEqual(["Back again"])
  })

  it("takes a clip's still with it when an admin deletes the clip", async () => {
    const userId = (await insertUser(db)).id
    const admin = (await insertUser(db, { role: "admin" })).id
    const clip = await store(userId, "video")
    await db
      .update(pomodoroMediaUploads)
      .set({ stillPath: `pomodoro-stills/${userId}/frame.jpg` })
      .where(eq(pomodoroMediaUploads.mediaId, clip.mediaId))
    const result = await deleteAdminUploads({ mediaIds: [clip.mediaId], actorUserId: admin })
    expect(result.deleted).toEqual([clip.mediaId])
    vi.mocked(deleteFromR2).mockClear()
    await drainBucketDeletions()
    expect(vi.mocked(deleteFromR2).mock.calls.flat()).toContain(`pomodoro-stills/${userId}/frame.jpg`)
  })

  it("clears a deleted account's stills from the bucket", async () => {
    const userId = (await insertUser(db)).id
    const clip = await store(userId, "video")
    await db
      .update(pomodoroMediaUploads)
      .set({ stillPath: `pomodoro-stills/${userId}/frame.jpg` })
      .where(eq(pomodoroMediaUploads.mediaId, clip.mediaId))
    // The shell's purge deletes the account row; the upload goes with it.
    await db.delete(customShellUsers).where(eq(customShellUsers.id, userId))
    expect(await db.select({ path: pomodoroBucketDeletions.path }).from(pomodoroBucketDeletions)).toEqual([
      { path: `pomodoro-stills/${userId}/frame.jpg` },
    ])
    vi.mocked(deleteFromR2).mockClear()
    expect(await drainBucketDeletions()).toBe(1)
    expect(vi.mocked(deleteFromR2).mock.calls).toEqual([[`pomodoro-stills/${userId}/frame.jpg`]])
    expect(await db.select().from(pomodoroBucketDeletions)).toEqual([])
  })

  it("keeps a noted file to try again when the bucket refuses", async () => {
    await db.insert(pomodoroBucketDeletions).values({ path: "pomodoro-stills/x/frame.jpg" })
    vi.mocked(deleteFromR2).mockRejectedValueOnce(new Error("bucket down"))
    expect(await drainBucketDeletions()).toBe(0)
    expect(await db.select({ path: pomodoroBucketDeletions.path }).from(pomodoroBucketDeletions)).toEqual([
      { path: "pomodoro-stills/x/frame.jpg" },
    ])
  })
})
