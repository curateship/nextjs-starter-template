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

import { type CustomShellDb } from "@/server/db"
import { now, uuid } from "@/server/auth/security"
import { deleteFromR2 } from "@/server/media/storage"
import { deleteAdminUploads, listAdminUploads } from "@/server/pomodoro/admin-uploads"
import {
  pomodoroAuditLogs,
  pomodoroGenerations,
  pomodoroMediaUploads,
  pomodoroPersonalRooms,
  pomodoroProfiles,
} from "@/server/pomodoro/schema"
import { customShellMedia } from "@/server/schema"
import { createTestDatabase, insertUser, insertWorkspace } from "@/server/test-support"

/**
 * Member uploads in the admin (admin task 06, part 3), against a real
 * database: what the list says about each file, and what a delete takes and
 * puts back.
 */

let client: PGlite
let db: CustomShellDb
let workspaceId: string

beforeEach(async () => {
  ;({ client, db } = await createTestDatabase())
  workspaceId = (await insertWorkspace(db)).id
  vi.mocked(deleteFromR2).mockClear()
})

afterEach(async () => {
  await client.close()
})

const LIST = { search: "", purpose: "all" as const, sort: "created" as const, direction: "desc" as const, page: 1, pageSize: 25 }

async function upload(
  userId: string,
  { purpose = "background", kind = "image", status = "ready", name = "rain.png" } = {}
) {
  const id = uuid()
  const timestamp = now()
  await db.insert(customShellMedia).values({
    id,
    workspaceId,
    userId,
    filename: name,
    originalName: name,
    fileSize: 2048,
    mimeType: kind === "audio" ? "audio/mpeg" : "image/png",
    fileType: kind,
    storagePath: `pomodoro/${id}/${name}`,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  await db.insert(pomodoroMediaUploads).values({ mediaId: id, userId, purpose, kind, status, originalBytes: 2048 })
  return id
}

describe("the uploads list", () => {
  it("says where a file is in use, whether AI made it, and gives an address only when ready", async () => {
    const owner = await insertUser(db, { name: "Ada" })
    const chosen = await upload(owner.id)
    const sound = await upload(owner.id, { purpose: "sound", kind: "audio", name: "hum.mp3" })
    const converting = await upload(owner.id, { status: "processing", name: "late.png" })
    await db.insert(pomodoroPersonalRooms).values({ userId: owner.id, background: `media:${chosen}`, sound: `media:${sound}` })
    await db.insert(pomodoroProfiles).values({ userId: owner.id, bannerRef: `media:${chosen}` })
    await db.insert(pomodoroGenerations).values({
      userId: owner.id,
      kind: "soundscape",
      prompt: "a low hum",
      status: "ready",
      month: "2026-10-01",
      mediaId: sound,
    })

    const { rows, total } = await listAdminUploads(LIST)
    expect(total).toBe(3)
    const byId = new Map(rows.map((row) => [row.mediaId, row]))
    expect(byId.get(chosen)).toMatchObject({ usedAs: ["room background", "profile banner"], generated: false, ownerName: "Ada" })
    expect(byId.get(sound)).toMatchObject({ usedAs: ["room sound"], generated: true })
    expect(byId.get(converting)).toMatchObject({ usedAs: [], url: "" })
    expect(byId.get(chosen)?.url).toContain("https://files.test/")
  })

  it("filters to one owner and to one purpose", async () => {
    const one = await insertUser(db)
    const two = await insertUser(db)
    await upload(one.id)
    await upload(one.id, { purpose: "sound", kind: "audio" })
    await upload(two.id)

    expect((await listAdminUploads({ ...LIST, user: one.id })).total).toBe(2)
    expect((await listAdminUploads({ ...LIST, purpose: "sound" })).total).toBe(1)
  })
})

describe("deleting uploads", () => {
  it("clears the choices pointing at the file, removes it, and logs once", async () => {
    const admin = await insertUser(db, { role: "admin" })
    const owner = await insertUser(db)
    const file = await upload(owner.id)
    const kept = await upload(owner.id, { name: "other.png" })
    await db.insert(pomodoroPersonalRooms).values({ userId: owner.id, background: `media:${file}`, sound: "curated:rain" })
    await db.insert(pomodoroProfiles).values({ userId: owner.id, bannerRef: `media:${file}` })

    const result = await deleteAdminUploads({ mediaIds: [file], actorUserId: admin.id })
    expect(result).toEqual({ deleted: [file], skipped: [] })

    const [room] = await db.select().from(pomodoroPersonalRooms).where(eq(pomodoroPersonalRooms.userId, owner.id))
    expect(room).toMatchObject({ background: null, sound: "curated:rain" })
    const [profile] = await db.select().from(pomodoroProfiles).where(eq(pomodoroProfiles.userId, owner.id))
    expect(profile.bannerRef).toBeNull()
    expect(await db.select().from(customShellMedia).where(eq(customShellMedia.id, file))).toHaveLength(0)
    expect(await db.select().from(pomodoroMediaUploads).where(eq(pomodoroMediaUploads.mediaId, file))).toHaveLength(0)
    expect(await db.select().from(pomodoroMediaUploads).where(eq(pomodoroMediaUploads.mediaId, kept))).toHaveLength(1)
    expect(vi.mocked(deleteFromR2).mock.calls.map(([path]) => path)).toContain(`pomodoro/${file}/rain.png`)

    const logs = await db.select().from(pomodoroAuditLogs)
    expect(logs).toEqual([expect.objectContaining({ action: "delete", resource: "member_uploads", recordIds: [file] })])
  })

  it("skips a file the site keeps and an id that is not a member upload, and logs nothing for them", async () => {
    const admin = await insertUser(db, { role: "admin" })
    const owner = await insertUser(db)
    const kept = await upload(owner.id)
    await db.update(customShellMedia).set({ emailProtectedAt: now() }).where(eq(customShellMedia.id, kept))

    const result = await deleteAdminUploads({ mediaIds: [kept, uuid()], actorUserId: admin.id })
    expect(result.deleted).toEqual([])
    expect(result.skipped).toHaveLength(2)
    expect(await db.select().from(pomodoroMediaUploads)).toHaveLength(1)
    expect(await db.select().from(pomodoroAuditLogs)).toHaveLength(0)
  })
})
