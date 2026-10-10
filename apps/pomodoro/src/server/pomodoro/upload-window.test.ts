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

// Every member here is Pro with 2 GB, unless a test says otherwise.
const plan = vi.hoisted(() => ({ canUploadMedia: true }))
vi.mock("@/server/pomodoro/entitlements", () => ({
  loadPomodoroEntitlements: vi.fn(async () => ({
    canUploadMedia: plan.canUploadMedia,
    storageLimitBytes: 2 * 1024 * 1024 * 1024,
  })),
}))

import { type CustomShellDb } from "@/server/db"
import { deleteFromR2, getFromR2 } from "@/server/media/storage"
import { loadAccountStorage } from "@/server/media/library"
import { now, uuid } from "@/server/auth/security"
import {
  claimNextUploadJob,
  countUploadsAhead,
  deletePomodoroUpload,
  finishUploadJob,
  loadJobFile,
  listPomodoroUploads,
  loadUploadTagSuggestions,
  storePomodoroUpload,
  editPomodoroUpload,
  validateUploadLabels,
} from "@/server/pomodoro/media-uploads"
import { pomodoroCatalogItems, pomodoroMediaUploads } from "@/server/pomodoro/schema"
import { customShellMedia, customShellNotifications } from "@/server/schema"
import { createTestDatabase, insertUser, insertWorkspace } from "@/server/test-support"

/**
 * The upload window's fields against a real database (uploads-and-sharing
 * task 01): what is stored, what the card reads back, how many files are
 * ahead, and which name the bell uses.
 */

let client: PGlite
let db: CustomShellDb

beforeEach(async () => {
  ;({ client, db } = await createTestDatabase())
  workspaceId = (await insertWorkspace(db)).id
  plan.canUploadMedia = true
})

afterEach(async () => {
  await client.close()
})

const VIDEO = { kind: "video" as const, mimeType: "video/mp4" }
const LABELS = {
  name: "Rain on my window",
  tags: ["rain", "night"],
  shared: true,
  trim: { startMs: 5000, endMs: 40000 },
}

/** `null` stores it the way AI generation does, with no window fields. */
function store(userId: string, labels: typeof LABELS | null = LABELS) {
  return storePomodoroUpload({
    userId,
    purpose: "background",
    file: { name: "IMG_4021.mp4" },
    bytes: new Uint8Array([1, 2, 3]),
    detected: VIDEO,
    labels: labels ?? undefined,
  })
}

describe("storing the window's fields", () => {
  it("saves the name, tags, Share tick and trim, and the card reads them back", async () => {
    const userId = (await insertUser(db)).id
    const stored = await store(userId)
    expect(stored).toMatchObject({ name: "Rain on my window", tags: ["rain", "night"], shared: true })

    const [row] = await db
      .select()
      .from(pomodoroMediaUploads)
      .where(eq(pomodoroMediaUploads.mediaId, stored.mediaId))
    expect(row).toMatchObject({ trimStartMs: 5000, trimEndMs: 40000, shared: true })

    const [listed] = await listPomodoroUploads(userId, "background")
    expect(listed).toMatchObject({ name: "Rain on my window", tags: ["rain", "night"], shared: true })
  })

  it("shows an older upload, which has no name, by its file name", async () => {
    const userId = (await insertUser(db)).id
    const stored = await store(userId)
    await db
      .update(pomodoroMediaUploads)
      .set({ name: null })
      .where(eq(pomodoroMediaUploads.mediaId, stored.mediaId))
    const [listed] = await listPomodoroUploads(userId, "background")
    expect(listed.name).toBe("IMG_4021.mp4")
  })

  it("names an AI file, which has no window, after its file", async () => {
    const userId = (await insertUser(db)).id
    const stored = await store(userId, null)
    expect(stored).toMatchObject({ name: "IMG_4021.mp4", tags: [], shared: false })
  })
})

describe("validateUploadLabels", () => {
  it("refuses a trim on a picture and a trim under a second", () => {
    expect(() => validateUploadLabels(LABELS, "image")).toThrow("INVALID_TRIM")
    expect(() =>
      validateUploadLabels({ ...LABELS, trim: { startMs: 0, endMs: 500 } }, "video")
    ).toThrow("INVALID_TRIM")
  })

  it("refuses an empty name and cleans the tags", () => {
    expect(() => validateUploadLabels({ ...LABELS, name: "  " }, "video")).toThrow(
      "UPLOAD_NAME_EMPTY"
    )
    expect(
      validateUploadLabels({ ...LABELS, tags: ["Rain", "rain", " Night "] }, "video").tags
    ).toEqual(["rain", "night"])
  })
})

describe("countUploadsAhead", () => {
  it("counts every member's sounds and clips still waiting before this one", async () => {
    const first = (await insertUser(db)).id
    const second = (await insertUser(db)).id
    const one = await store(first)
    const two = await store(second)
    expect(await countUploadsAhead(one.mediaId)).toBe(0)
    expect(await countUploadsAhead(two.mediaId)).toBe(1)

    // A finished one is no longer ahead.
    await db
      .update(pomodoroMediaUploads)
      .set({ status: "ready" })
      .where(eq(pomodoroMediaUploads.mediaId, one.mediaId))
    expect(await countUploadsAhead(two.mediaId)).toBe(0)
  })
})

describe("the bell", () => {
  it("says the name the member typed when a clip is ready", async () => {
    const userId = (await insertUser(db)).id
    const stored = await store(userId)
    await db
      .update(pomodoroMediaUploads)
      .set({ status: "processing" })
      .where(eq(pomodoroMediaUploads.mediaId, stored.mediaId))
    const [media] = await db
      .select({ storagePath: customShellMedia.storagePath })
      .from(customShellMedia)
      .where(eq(customShellMedia.id, stored.mediaId))
    await finishUploadJob({
      mediaId: stored.mediaId,
      claimedAt: null,
      storagePath: `${userId}/done.mp4`,
      mimeType: "video/mp4",
      fileSize: 3,
      previousStoragePath: media.storagePath,
    })
    const notices = await db
      .select({ detail: customShellNotifications.detail })
      .from(customShellNotifications)
      .where(eq(customShellNotifications.recipientUserId, userId))
    expect(notices).toEqual([{ detail: "Rain on my window" }])
  })
})

describe("loadUploadTagSuggestions", () => {
  it("offers Live catalogue tags of the same kind, then the member's own", async () => {
    const userId = (await insertUser(db)).id
    const timestamp = now()
    await db.insert(pomodoroCatalogItems).values([
      { kind: "theme", key: `live-${uuid().slice(0, 8)}`, label: "Live", status: "live", tags: ["zz-live-theme"], createdAt: timestamp },
      { kind: "theme", key: `draft-${uuid().slice(0, 8)}`, label: "Draft", status: "draft", tags: ["zz-draft-theme"] },
      { kind: "sound", key: `sound-${uuid().slice(0, 8)}`, label: "Sound", status: "live", tags: ["zz-live-sound"] },
    ])
    await store(userId, { ...LABELS, tags: ["zz-my-own"] })
    const tags = await loadUploadTagSuggestions(userId, "background")
    expect(tags).toContain("zz-live-theme")
    expect(tags).toContain("zz-my-own")
    expect(tags).not.toContain("zz-draft-theme")
    expect(tags).not.toContain("zz-live-sound")
  })
})

describe("editPomodoroUpload", () => {
  it("lets the owner rename, retag and untick an upload, and nobody else", async () => {
    const owner = (await insertUser(db)).id
    const stranger = (await insertUser(db)).id
    const stored = await store(owner)

    await expect(
      editPomodoroUpload(stranger, stored.mediaId, { name: "Mine now", tags: [], shared: false })
    ).rejects.toThrow("UPLOAD_NOT_FOUND")
    await expect(
      editPomodoroUpload(owner, stored.mediaId, { name: " ", tags: [], shared: false })
    ).rejects.toThrow("UPLOAD_NAME_EMPTY")

    expect(
      await editPomodoroUpload(owner, stored.mediaId, {
        name: " City at night ",
        tags: ["City", "night"],
        shared: false,
      })
    ).toEqual({ name: "City at night", tags: ["city", "night"], shared: false })
    const [listed] = await listPomodoroUploads(owner, "background")
    expect(listed).toMatchObject({ name: "City at night", tags: ["city", "night"], shared: false })
  })
})

/** What the worker does to a claimed job, with a made-up output path. */
async function prepare(mediaId: string, output: string) {
  const job = await claimNextUploadJob()
  expect(job?.mediaId).toBe(mediaId)
  const file = await loadJobFile(mediaId)
  await finishUploadJob({
    mediaId,
    claimedAt: job!.claimedAt,
    storagePath: output,
    mimeType: "video/mp4",
    fileSize: 2,
    previousStoragePath: file!.storagePath,
  })
  return file!
}

async function mediaPaths(userId: string) {
  const rows = await db
    .select({ path: customShellMedia.storagePath })
    .from(customShellMedia)
    .where(eq(customShellMedia.userId, userId))
  return rows.map((row) => row.path).sort()
}

describe("re-trimming from the cog", () => {
  it("keeps the original, cuts again from it, and plays the old cut meanwhile", async () => {
    const userId = (await insertUser(db)).id
    const stored = await store(userId)
    const [raw] = await mediaPaths(userId)
    vi.mocked(deleteFromR2).mockClear()

    // The first prepare keeps the raw original as a library file of its own.
    await prepare(stored.mediaId, `${userId}/cut-1.mp4`)
    expect(deleteFromR2).not.toHaveBeenCalled()
    expect(await mediaPaths(userId)).toEqual([raw, `${userId}/cut-1.mp4`].sort())
    // Both count toward the member's space: 3 bytes sent, 2 bytes cut.
    expect((await loadAccountStorage(userId)).bytes).toBe(5)
    let [listed] = await listPomodoroUploads(userId, "background")
    expect(listed.trim).toEqual({ startMs: 5000, endMs: 40000 })
    expect(listed.sourceUrl).toBe(`https://files.test/${raw}`)

    await editPomodoroUpload(userId, stored.mediaId, {
      name: "Rain on my window",
      tags: ["rain"],
      shared: true,
      trim: { startMs: 1000, endMs: 50000 },
    })
    ;[listed] = await listPomodoroUploads(userId, "background")
    expect(listed.status).toBe("queued")
    // The old cut still plays while the new one is made.
    expect(listed.url).toBe(`https://files.test/${userId}/cut-1.mp4`)
    // A second re-trim waits for this one.
    await expect(
      editPomodoroUpload(userId, stored.mediaId, { ...LABELS, trim: null })
    ).rejects.toThrow("UPLOAD_NOT_READY")

    // The worker reads the original, and only the old cut is thrown away.
    const file = await prepare(stored.mediaId, `${userId}/cut-2.mp4`)
    expect(file.sourcePath).toBe(raw)
    expect(vi.mocked(deleteFromR2).mock.calls).toEqual([[`${userId}/cut-1.mp4`]])
    expect(await mediaPaths(userId)).toEqual([raw, `${userId}/cut-2.mp4`].sort())

    // Deleting the upload takes the original with it.
    vi.mocked(deleteFromR2).mockClear()
    await deletePomodoroUpload(userId, stored.mediaId)
    expect(await mediaPaths(userId)).toEqual([])
    expect(vi.mocked(deleteFromR2).mock.calls.flat().sort()).toEqual(
      [raw, `${userId}/cut-2.mp4`].sort()
    )
  })

  it("copies an older upload's finished file to be the original, so it can only get shorter", async () => {
    const userId = (await insertUser(db)).id
    // Already finished and never kept an original, like an AI-made file.
    const stored = await storePomodoroUpload({
      userId,
      purpose: "background",
      file: { name: "old.mp4" },
      bytes: new Uint8Array([1, 2, 3]),
      detected: VIDEO,
      alreadyProcessed: true,
    })
    const [path] = await mediaPaths(userId)
    vi.mocked(getFromR2).mockResolvedValueOnce({
      Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3]) },
    } as never)
    await editPomodoroUpload(userId, stored.mediaId, {
      name: "old",
      tags: [],
      shared: false,
      trim: { startMs: 0, endMs: 2000 },
    })
    const [copy] = (await mediaPaths(userId)).filter((one) => one !== path)
    expect(copy).toMatch(new RegExp(`^${userId}/.+_old\\.mp4$`))
    // The old cut still plays while the new one is made.
    const [listed] = await listPomodoroUploads(userId, "background")
    expect(listed.url).toBe(`https://files.test/${path}`)

    vi.mocked(deleteFromR2).mockClear()
    const file = await prepare(stored.mediaId, `${userId}/cut.mp4`)
    expect(file.sourcePath).toBe(copy)
    expect(vi.mocked(deleteFromR2).mock.calls).toEqual([[path]])
    expect(await mediaPaths(userId)).toEqual([copy, `${userId}/cut.mp4`].sort())
  })

  it("refuses a trim on a picture and on a first prepare that failed", async () => {
    const userId = (await insertUser(db)).id
    const picture = await storePomodoroUpload({
      userId,
      purpose: "background",
      file: { name: "p.png" },
      bytes: new Uint8Array([1]),
      detected: { kind: "image", mimeType: "image/png" },
    })
    await expect(
      editPomodoroUpload(userId, picture.mediaId, { ...LABELS, trim: null })
    ).rejects.toThrow("INVALID_TRIM")

    const clip = await store(userId)
    await db
      .update(pomodoroMediaUploads)
      .set({ status: "failed" })
      .where(eq(pomodoroMediaUploads.mediaId, clip.mediaId))
    await expect(
      editPomodoroUpload(userId, clip.mediaId, { ...LABELS, trim: null })
    ).rejects.toThrow("UPLOAD_NOT_READY")
  })
})

describe("what keeps re-trimming honest", () => {
  it("refuses a new cut once the member is no longer Pro, but still saves a rename", async () => {
    const userId = (await insertUser(db)).id
    const stored = await store(userId)
    await prepare(stored.mediaId, `${userId}/cut-1.mp4`)
    plan.canUploadMedia = false
    await expect(
      editPomodoroUpload(userId, stored.mediaId, { ...LABELS, trim: null })
    ).rejects.toThrow("PRO_REQUIRED")
    await editPomodoroUpload(userId, stored.mediaId, { name: "Renamed", tags: [], shared: false })
    const [listed] = await listPomodoroUploads(userId, "background")
    expect(listed).toMatchObject({ name: "Renamed", status: "ready" })
  })

  it("puts a re-trim of an old file behind newer uploads in the queue", async () => {
    const userId = (await insertUser(db)).id
    const old = await store(userId)
    await prepare(old.mediaId, `${userId}/cut-1.mp4`)
    const newer = await store(userId)
    await editPomodoroUpload(userId, old.mediaId, { ...LABELS, trim: { startMs: 0, endMs: 9000 } })
    expect(await countUploadsAhead(old.mediaId)).toBe(1)
    expect((await claimNextUploadJob())?.mediaId).toBe(newer.mediaId)
  })

  it("never lets a stalled worker pass finish a job another pass has taken", async () => {
    const userId = (await insertUser(db)).id
    const stored = await store(userId)
    const stale = await claimNextUploadJob()
    // The claim timed out and another pass took the job.
    await db
      .update(pomodoroMediaUploads)
      .set({ claimedAt: new Date(Date.now() - 60 * 60 * 1000) })
      .where(eq(pomodoroMediaUploads.mediaId, stored.mediaId))
    const fresh = await claimNextUploadJob()
    expect(fresh?.mediaId).toBe(stored.mediaId)
    const file = await loadJobFile(stored.mediaId)
    const result = await finishUploadJob({
      mediaId: stored.mediaId,
      claimedAt: stale!.claimedAt,
      storagePath: `${userId}/stale.mp4`,
      mimeType: "video/mp4",
      fileSize: 2,
      previousStoragePath: file!.storagePath,
    })
    expect(result.settled).toBe(false)
    const [row] = await db.select().from(pomodoroMediaUploads).where(eq(pomodoroMediaUploads.mediaId, stored.mediaId))
    expect(row.status).toBe("processing")
  })

  it("takes the kept original with the upload when the library row goes elsewhere", async () => {
    const userId = (await insertUser(db)).id
    const stored = await store(userId)
    await prepare(stored.mediaId, `${userId}/cut-1.mp4`)
    expect(await mediaPaths(userId)).toHaveLength(2)
    // The shell's Media page deletes the library row and knows nothing of originals.
    await db.delete(customShellMedia).where(eq(customShellMedia.id, stored.mediaId))
    expect(await mediaPaths(userId)).toEqual([])
  })
})
