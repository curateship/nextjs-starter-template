import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SHARE_ONLY_READY_MESSAGE } from "@/lib/video/export-shares"
import { RENDER_NOT_FOUND_MESSAGE } from "@/lib/video/render"
import { now, uuid } from "@/server/auth/security"
import { type CustomShellDb } from "@/server/db"
import { type CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"
import {
  createOwnedExportShare,
  findSharedExport,
  getOwnedExportShare,
  listLiveSharedExportIds,
  readSharedExportView,
  revokeOwnedExportShare,
} from "@/server/video/export-shares"
import { deleteOwnedExports } from "@/server/video/exports"
import { createOwnedProject } from "@/server/video/projects"
import { videoExportShares, videoRenderJobs } from "@/server/video/schema"

// Deleting an export removes its file first and keeps the row if that fails,
// so the bucket has to answer for a delete to go through.
vi.mock("@/server/media/storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/media/storage")>()),
  deleteFromR2: async () => undefined,
}))

let client: PGlite
let database: CustomShellDb
let user: CustomShellUser

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  user = await insertUser(database)
})

afterEach(async () => {
  await client.close()
})

/** An export row as the worker leaves it, finished unless told otherwise. */
async function exportRow(
  overrides: Partial<typeof videoRenderJobs.$inferInsert> = {},
  ownerId = user.id
) {
  const project = await createOwnedProject(ownerId, "Client cut", database)
  const at = now()
  const id = uuid()
  const [row] = await database
    .insert(videoRenderJobs)
    .values({
      id,
      userId: ownerId,
      projectId: project.id,
      status: "ready",
      quality: "high",
      aspect: "9:16",
      storagePath: `video/exports/${ownerId}/${id}.mp4`,
      width: 1080,
      height: 1920,
      title: "Spring launch",
      createdAt: at,
      updatedAt: at,
      finishedAt: at,
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

describe("making a link", () => {
  it("gives a finished export a 64-character random token that opens it", async () => {
    const job = await exportRow()
    const link = await share(job.id)

    expect(link.token).toMatch(/^[0-9a-f]{64}$/)
    expect(link.expires_at).toBeNull()
    expect(link.expired).toBe(false)
    expect((await findSharedExport(link.token, database))?.storagePath).toBe(
      job.storagePath
    )
  })

  it("tells the page only the export's title and shape", async () => {
    const job = await exportRow()
    const link = await share(job.id)

    expect(await readSharedExportView(link.token, database)).toEqual({
      title: "Spring launch",
      width: 1080,
      height: 1920,
    })
  })

  it("refuses an export that has no file yet", async () => {
    const failed = await exportRow({ status: "error", storagePath: null })

    await expect(share(failed.id)).rejects.toThrow(SHARE_ONLY_READY_MESSAGE)
  })

  it("refuses somebody else's export, and never reads or turns off its link", async () => {
    const stranger = await insertUser(database)
    const theirs = await exportRow({}, stranger.id)
    const theirLink = await createOwnedExportShare({
      userId: stranger.id,
      exportId: theirs.id,
      expiresInDays: null,
      database,
    })

    await expect(share(theirs.id)).rejects.toThrow(RENDER_NOT_FOUND_MESSAGE)
    await expect(
      getOwnedExportShare(user.id, theirs.id, database)
    ).rejects.toThrow(RENDER_NOT_FOUND_MESSAGE)
    await expect(
      revokeOwnedExportShare(user.id, theirs.id, database)
    ).rejects.toThrow(RENDER_NOT_FOUND_MESSAGE)
    expect(await findSharedExport(theirLink.token, database)).not.toBeNull()
  })

  it("keeps one live link per export: a new one turns the old one off", async () => {
    const job = await exportRow()
    const first = await share(job.id)
    const second = await share(job.id)

    expect(second.token).not.toBe(first.token)
    expect(await findSharedExport(first.token, database)).toBeNull()
    expect(await findSharedExport(second.token, database)).not.toBeNull()
    expect((await getOwnedExportShare(user.id, job.id, database))?.token).toBe(
      second.token
    )
  })
})

describe("switching a link off", () => {
  it("stops a revoked link on the very next request", async () => {
    const job = await exportRow()
    const link = await share(job.id)

    await revokeOwnedExportShare(user.id, job.id, database)

    expect(await findSharedExport(link.token, database)).toBeNull()
    expect(await getOwnedExportShare(user.id, job.id, database)).toBeNull()
    expect(await listLiveSharedExportIds(user.id, [job.id], database)).toEqual(
      []
    )
  })

  it("stops an expired link, tells the owner when, and lets a new one be made", async () => {
    const job = await exportRow()
    const link = await share(job.id, 7)
    expect(Date.parse(link.expires_at ?? "")).toBeGreaterThan(Date.now())

    await database
      .update(videoExportShares)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(videoExportShares.token, link.token))

    expect(await findSharedExport(link.token, database)).toBeNull()
    expect(await listLiveSharedExportIds(user.id, [job.id], database)).toEqual(
      []
    )
    expect(
      (await getOwnedExportShare(user.id, job.id, database))?.expired
    ).toBe(true)

    const fresh = await share(job.id)
    expect(await findSharedExport(fresh.token, database)).not.toBeNull()
  })

  it("deletes the link with its export", async () => {
    const job = await exportRow()
    const link = await share(job.id)

    await deleteOwnedExports(user.id, [job.id], database)

    expect(await findSharedExport(link.token, database)).toBeNull()
    expect(await database.select().from(videoExportShares)).toEqual([])
  })

  it("lists only the exports a link opens right now", async () => {
    const shared = await exportRow()
    const unshared = await exportRow()
    await share(shared.id)

    expect(
      await listLiveSharedExportIds(user.id, [shared.id, unshared.id], database)
    ).toEqual([shared.id])
  })
})

describe("what a stranger can try", () => {
  it("opens nothing with a token that is not 64 lowercase hex characters", async () => {
    for (const token of ["", "abc", "' or 1=1 --", "A".repeat(64), "g".repeat(64)]) {
      expect(await findSharedExport(token, database)).toBeNull()
    }
  })

  it("opens nothing with a well-formed token nobody made", async () => {
    expect(await findSharedExport("a".repeat(64), database)).toBeNull()
  })
})
