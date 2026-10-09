import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/server/media/storage", () => ({
  deleteFromR2: vi.fn(async () => undefined),
  uploadToR2: vi.fn(async () => undefined),
  getPublicMediaUrl: vi.fn(async (path: string) => `https://files.test/${path}`),
  getFromR2: vi.fn(),
  R2StorageNotConfiguredError: class extends Error {},
}))

import { type CustomShellDb } from "@/server/db"
import { now, uuid } from "@/server/auth/security"
import { deleteAdminGenerationFiles, listAdminGenerations } from "@/server/pomodoro/admin-generations"
import { pomodoroGenerations, pomodoroMediaUploads, pomodoroPersonalRooms } from "@/server/pomodoro/schema"
import { customShellMedia } from "@/server/schema"
import { createTestDatabase, insertUser, insertWorkspace } from "@/server/test-support"

/**
 * AI generations in the admin (admin task 06, part 12): the list names the
 * provider, and deleting removes the file but keeps the request on record.
 */

let client: PGlite
let db: CustomShellDb

beforeEach(async () => {
  ;({ client, db } = await createTestDatabase())
})

afterEach(async () => {
  await client.close()
})

const LIST = {
  search: "",
  kind: "all" as const,
  status: "all" as const,
  sort: "created" as const,
  direction: "desc" as const,
  page: 1,
  pageSize: 25,
}

async function generated(userId: string, withFile: boolean, status = "ready") {
  let mediaId: string | null = null
  if (withFile) {
    const workspace = await insertWorkspace(db)
    mediaId = uuid()
    const timestamp = now()
    await db.insert(customShellMedia).values({
      id: mediaId,
      workspaceId: workspace.id,
      userId,
      filename: "hum.mp3",
      originalName: "a low hum.mp3",
      fileSize: 4096,
      mimeType: "audio/mpeg",
      fileType: "audio",
      storagePath: `pomodoro/${mediaId}.mp3`,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    await db
      .insert(pomodoroMediaUploads)
      .values({ mediaId, userId, purpose: "sound", kind: "audio", status: "ready", originalBytes: 4096 })
  }
  const [row] = await db
    .insert(pomodoroGenerations)
    .values({
      userId,
      kind: "soundscape",
      prompt: "a low hum",
      status,
      month: "2026-10-01",
      mediaId,
      failureReason: status === "failed" ? "That took too long. Try again." : null,
    })
    .returning({ id: pomodoroGenerations.id })
  return { id: row.id, mediaId }
}

describe("the generations list", () => {
  it("names the kind's provider and gives a finished file's address", async () => {
    const owner = await insertUser(db, { name: "Ada" })
    await generated(owner.id, true)
    await generated(owner.id, false, "failed")

    const { rows, total } = await listAdminGenerations(LIST)
    expect(total).toBe(2)
    expect(rows.find((row) => row.status === "ready")).toMatchObject({
      provider: "elevenlabs",
      fileType: "audio",
      ownerName: "Ada",
    })
    expect(rows.find((row) => row.status === "failed")).toMatchObject({
      url: "",
      failureReason: "That took too long. Try again.",
    })
    expect((await listAdminGenerations({ ...LIST, status: "failed" })).total).toBe(1)
  })
})

describe("deleting a generation's file", () => {
  it("removes the file and keeps the request, with no file", async () => {
    const admin = await insertUser(db, { role: "admin" })
    const owner = await insertUser(db)
    const made = await generated(owner.id, true)
    const failed = await generated(owner.id, false, "failed")
    await db.insert(pomodoroPersonalRooms).values({ userId: owner.id, sound: `media:${made.mediaId}` })

    const result = await deleteAdminGenerationFiles({ generationIds: [made.id, failed.id], actorUserId: admin.id })
    expect(result).toEqual({ deleted: [made.id], skipped: [failed.id] })

    const [kept] = await db.select().from(pomodoroGenerations).where(eq(pomodoroGenerations.id, made.id))
    expect(kept).toMatchObject({ mediaId: null, prompt: "a low hum", status: "ready" })
    expect(await db.select().from(pomodoroMediaUploads)).toHaveLength(0)
    const [room] = await db.select().from(pomodoroPersonalRooms)
    expect(room.sound).toBeNull()
  })
})
