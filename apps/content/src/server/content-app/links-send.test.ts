import type { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createTestDatabase, insertUser, type TestDatabase } from "@/server/test-support"

/**
 * Send to Promo inside Content, end to end with no stand-in fetch: Video posts
 * its note to Promo, Promo copies the export's file from Video, and tells Video
 * it arrived. Every call goes through `linkFetch`
 * (`workspace/docs/content-app.md`, "The links between Video, Promo and
 * Viral"). Storage is a map in memory.
 */

vi.mock("@/server/notifications/events", () => ({ publishNotificationCreated: async () => undefined }))
const bucket = vi.hoisted(() => ({ files: new Map<string, number>(), deleted: [] as string[] }))
vi.mock("@/server/media/storage", async (original) => ({
  ...(await original<typeof import("@/server/media/storage")>()),
  getFromR2: async () => ({ Body: { transformToWebStream: () => new Response("12345").body }, ContentLength: 5 }),
  uploadToR2: async (path: string, body: Uint8Array) => void bucket.files.set(path, body.byteLength),
  deleteFromR2: async (path: string) => void bucket.deleted.push(path),
}))

const { startPromoSends } = await import("@/server/video/promo-sends")
const { createProject } = await import("@/server/social/projects")
const { promoArchiveItems } = await import("@/server/archive/schema")
const { videoPromoSends, videoRenderJobs } = await import("@/server/video/schema")
const { insertVideo } = await import("@/server/video/project-videos")

describe("Send to Promo inside Content", () => {
  let client: PGlite
  let db: TestDatabase

  beforeEach(async () => {
    process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY = "test-key-for-a-content-send"
    bucket.files.clear()
    ;({ client, db } = await createTestDatabase())
  })

  afterEach(async () => {
    await client.close()
  })

  it("puts a copy of the export in the project's Archive and tells the editor it arrived", async () => {
    const admin = await insertUser(db, { role: "admin" })
    const projectId = await createProject(admin.id, "Meal prep", db, ["instagram"])
    const at = new Date()
    const video = await insertVideo(admin.id, projectId, { name: "Sunday prep", aspect: "9:16" }, db)
    const exportId = crypto.randomUUID()
    const exportPath = `video/exports/${admin.id}/${exportId}.mp4`
    await db.insert(videoRenderJobs).values({
      id: exportId,
      userId: admin.id,
      kind: "video",
      projectId,
      videoId: video.id,
      status: "ready",
      quality: "high",
      aspect: "9:16",
      storagePath: exportPath,
      fileSize: 5,
      durationMs: 30_000,
      width: 1080,
      height: 1920,
      title: "Sunday prep",
      createdAt: at,
      updatedAt: at,
      finishedAt: at,
    })

    const [send] = await startPromoSends({ userId: admin.id, exportIds: [exportId], promoProjects: [{ id: projectId, name: "Meal prep" }] }, { db })
    expect(send.status).not.toBe("failed")

    // Promo copies in the background; wait for the item to settle.
    let item: typeof promoArchiveItems.$inferSelect | undefined
    for (let tries = 0; tries < 100; tries++) {
      ;[item] = await db.select().from(promoArchiveItems).where(eq(promoArchiveItems.projectId, projectId))
      if (item && item.status !== "copying") break
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    expect(item?.status).toBe("ready")
    // A copy of its own, not the export's file.
    const copies = [...bucket.files.keys()].filter((path) => path !== exportPath)
    expect(copies.length).toBeGreaterThan(0)
    expect(copies.every((path) => !path.startsWith("video/exports/"))).toBe(true)

    // Promo told the editor, so the send ended as sent with Promo's item on it.
    let row: typeof videoPromoSends.$inferSelect | undefined
    for (let tries = 0; tries < 100; tries++) {
      ;[row] = await db.select().from(videoPromoSends).where(eq(videoPromoSends.id, send.id))
      if (row?.status === "sent") break
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    expect(row?.status).toBe("sent")
    expect(row?.promoItemId).toBe(item?.id)
  })
})
