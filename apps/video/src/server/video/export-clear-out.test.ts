import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { now, uuid } from "@/server/auth/security"
import { type CustomShellDb } from "@/server/db"
import { type CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"
import {
  clearOutOldExports,
  previewExportClearOut,
} from "@/server/video/export-clear-out"
import {
  createOwnedExportShare,
  revokeOwnedExportShare,
} from "@/server/video/export-shares"
import { deleteOwnedExports, loadExportStorage } from "@/server/video/exports"
import { createOwnedProject, deleteOwnedProjects } from "@/server/video/projects"
import {
  videoExportShares,
  videoProjects,
  videoRenderJobs,
} from "@/server/video/schema"

// Every removal is recorded, and any path in `refused` fails the way an
// unreachable bucket would.
const storage = vi.hoisted(() => ({
  removed: [] as string[],
  refused: new Set<string>(),
}))
vi.mock("@/server/media/storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/media/storage")>()),
  deleteFromR2: async (path: string) => {
    if (storage.refused.has(path)) throw new Error("R2 unreachable")
    storage.removed.push(path)
  },
}))

let client: PGlite
let database: CustomShellDb
let user: CustomShellUser

const DAY_MS = 24 * 60 * 60 * 1000
const MB = 1024 * 1024

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  user = await insertUser(database)
  storage.removed = []
  storage.refused = new Set()
})

afterEach(async () => {
  await client.close()
})

/** A finished export, `daysOld` days after it was made. */
async function exportRow({
  daysOld = 0,
  bytes = 10 * MB,
  ownerId = user.id,
  projectId,
  ...overrides
}: Partial<typeof videoRenderJobs.$inferInsert> & {
  daysOld?: number
  bytes?: number
  ownerId?: string
} = {}) {
  const project =
    projectId ?? (await createOwnedProject(ownerId, "Client cut", database)).id
  const finished = new Date(now().getTime() - daysOld * DAY_MS)
  const id = uuid()
  const [row] = await database
    .insert(videoRenderJobs)
    .values({
      id,
      userId: ownerId,
      projectId: project,
      status: "ready",
      quality: "high",
      aspect: "9:16",
      storagePath: `video/exports/${ownerId}/${id}.mp4`,
      thumbnailStoragePath: `video/export-covers/${ownerId}/${id}.jpg`,
      fileSize: bytes,
      createdAt: finished,
      updatedAt: finished,
      finishedAt: finished,
      ...overrides,
    })
    .returning()
  return row
}

function share(exportId: string, expiresInDays: number | null = null) {
  return createOwnedExportShare({
    userId: user.id,
    exportId,
    expiresInDays,
    database,
  })
}

const sixMonthsAgo = () => new Date(now().getTime() - 182 * DAY_MS)

describe("the storage total", () => {
  it("adds up every finished export of theirs and nothing else", async () => {
    const stranger = await insertUser(database)
    await exportRow({ bytes: 3 * MB })
    await exportRow({ bytes: 5 * MB })
    await exportRow({ bytes: 7 * MB, daysOld: 400 })
    await exportRow({ status: "error", storagePath: null, fileSize: null })
    await exportRow({ ownerId: stranger.id, bytes: 900 * MB })

    expect(await loadExportStorage(user.id, database)).toEqual({
      exports: 3,
      bytes: 15 * MB,
    })
  })

  it("is zero for somebody who has made nothing", async () => {
    expect(await loadExportStorage(user.id, database)).toEqual({
      exports: 0,
      bytes: 0,
    })
  })
})

describe("deleting an export", () => {
  it("removes the file and the cover from storage, then the row", async () => {
    const job = await exportRow()

    const result = await deleteOwnedExports(user.id, [job.id], database)

    expect(result).toEqual({ deleted_ids: [job.id], failed_ids: [] })
    expect(storage.removed.sort()).toEqual(
      [job.storagePath, job.thumbnailStoragePath].sort()
    )
    expect(await database.select().from(videoRenderJobs)).toEqual([])
  })

  it("keeps the row when storage refuses, so the file is never left behind", async () => {
    const stuck = await exportRow()
    const fine = await exportRow()
    storage.refused.add(stuck.storagePath!)

    const result = await deleteOwnedExports(
      user.id,
      [stuck.id, fine.id],
      database
    )

    expect(result).toEqual({ deleted_ids: [fine.id], failed_ids: [stuck.id] })
    const left = await database.select().from(videoRenderJobs)
    expect(left.map((row) => row.id)).toEqual([stuck.id])
  })
})

describe("counting a clear-out", () => {
  it("counts finished exports older than the cutoff, the shared ones apart", async () => {
    const stranger = await insertUser(database)
    await exportRow({ daysOld: 200, bytes: 4 * MB })
    await exportRow({ daysOld: 300, bytes: 6 * MB })
    const shared = await exportRow({ daysOld: 250, bytes: 20 * MB })
    await share(shared.id)
    await exportRow({ daysOld: 10, bytes: 50 * MB })
    await exportRow({
      daysOld: 400,
      status: "error",
      storagePath: null,
      fileSize: null,
    })
    await exportRow({ daysOld: 400, ownerId: stranger.id })
    const before = sixMonthsAgo()

    expect(await previewExportClearOut(user.id, before, database)).toEqual({
      before: before.toISOString(),
      exports: 2,
      bytes: 10 * MB,
      shared_exports: 1,
      shared_bytes: 20 * MB,
    })
  })

  it("counts an expired or turned-off link as no link at all", async () => {
    const expired = await exportRow({ daysOld: 200 })
    const revoked = await exportRow({ daysOld: 200 })
    await share(expired.id, 1)
    await database
      .update(videoExportShares)
      .set({ expiresAt: new Date(now().getTime() - DAY_MS) })
      .where(eq(videoExportShares.exportId, expired.id))
    await share(revoked.id)
    await revokeOwnedExportShare(user.id, revoked.id, database)

    const preview = await previewExportClearOut(
      user.id,
      sixMonthsAgo(),
      database
    )
    expect(preview.exports).toBe(2)
    expect(preview.shared_exports).toBe(0)
  })
})

describe("clearing out", () => {
  it("deletes the old unshared ones and keeps the shared one", async () => {
    const old = await exportRow({ daysOld: 200, bytes: 4 * MB })
    const shared = await exportRow({ daysOld: 250, bytes: 20 * MB })
    await share(shared.id)
    const recent = await exportRow({ daysOld: 10 })

    const result = await clearOutOldExports({
      userId: user.id,
      before: sixMonthsAgo(),
      includeShared: false,
      database,
    })

    expect(result).toEqual({ deleted: 1, bytes_freed: 4 * MB, failed: 0 })
    const left = await database.select().from(videoRenderJobs)
    expect(left.map((row) => row.id).sort()).toEqual(
      [shared.id, recent.id].sort()
    )
    expect(storage.removed).toContain(old.storagePath)
  })

  it("takes the shared one too when asked", async () => {
    await exportRow({ daysOld: 200, bytes: 4 * MB })
    const shared = await exportRow({ daysOld: 250, bytes: 20 * MB })
    await share(shared.id)

    const result = await clearOutOldExports({
      userId: user.id,
      before: sixMonthsAgo(),
      includeShared: true,
      database,
    })

    expect(result).toEqual({ deleted: 2, bytes_freed: 24 * MB, failed: 0 })
  })

  it("leaves a link made after the count alone", async () => {
    const job = await exportRow({ daysOld: 200 })
    const before = sixMonthsAgo()
    expect(
      (await previewExportClearOut(user.id, before, database)).exports
    ).toBe(1)
    await share(job.id)

    const result = await clearOutOldExports({
      userId: user.id,
      before,
      includeShared: false,
      database,
    })

    expect(result.deleted).toBe(0)
    expect(await database.select().from(videoRenderJobs)).toHaveLength(1)
  })

  it("reports what storage would not let go of, and frees only the rest", async () => {
    const stuck = await exportRow({ daysOld: 200, bytes: 4 * MB })
    await exportRow({ daysOld: 200, bytes: 6 * MB })
    storage.refused.add(stuck.thumbnailStoragePath!)

    const result = await clearOutOldExports({
      userId: user.id,
      before: sixMonthsAgo(),
      includeShared: false,
      database,
    })

    expect(result).toEqual({ deleted: 1, bytes_freed: 6 * MB, failed: 1 })
  })
})

describe("deleting a project", () => {
  it("removes its exports' files from storage too", async () => {
    const project = await createOwnedProject(user.id, "Old cut", database)
    const first = await exportRow({ projectId: project.id })
    const second = await exportRow({ projectId: project.id, aspect: "1:1" })
    const elsewhere = await exportRow()

    const result = await deleteOwnedProjects(user.id, [project.id], database)

    expect(result).toEqual({ deleted_ids: [project.id], failed_ids: [] })
    expect(storage.removed.sort()).toEqual(
      [
        first.storagePath,
        first.thumbnailStoragePath,
        second.storagePath,
        second.thumbnailStoragePath,
      ].sort()
    )
    const left = await database.select().from(videoRenderJobs)
    expect(left.map((row) => row.id)).toEqual([elsewhere.id])
  })

  it("keeps a project whose export file would not come out of storage", async () => {
    const stuck = await createOwnedProject(user.id, "Stuck", database)
    const fine = await createOwnedProject(user.id, "Fine", database)
    const job = await exportRow({ projectId: stuck.id })
    storage.refused.add(job.storagePath!)

    const result = await deleteOwnedProjects(
      user.id,
      [stuck.id, fine.id],
      database
    )

    expect(result).toEqual({ deleted_ids: [fine.id], failed_ids: [stuck.id] })
    const left = await database.select().from(videoProjects)
    expect(left.map((row) => row.id)).toEqual([stuck.id])
  })

  it("never reads somebody else's exports", async () => {
    const stranger = await insertUser(database)
    const theirs = await createOwnedProject(stranger.id, "Theirs", database)
    await exportRow({ projectId: theirs.id, ownerId: stranger.id })

    const result = await deleteOwnedProjects(user.id, [theirs.id], database)

    expect(result).toEqual({ deleted_ids: [], failed_ids: [] })
    expect(storage.removed).toEqual([])
  })
})
