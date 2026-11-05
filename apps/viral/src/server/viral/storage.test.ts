import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { now, uuid } from "@/server/auth/security"
import { type CustomShellDb } from "@/server/db"
import { customShellMedia, type CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser, insertWorkspace } from "@/server/test-support"
import { createViralProject } from "@/server/viral/projects"
import { viralVaultItems, viralVideos } from "@/server/viral/schema"
import { cleanUpStorage, markSavedVideoOpened, storageSummary } from "@/server/viral/storage"

/**
 * Storage clean-up (task part 19, Tyler: "Button only"): the button deletes
 * downloaded copies nobody opened for 30 days, never one a vault idea keeps,
 * and never another person's.
 */

const removed = vi.hoisted(() => [] as string[])

vi.mock("@/server/media/storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/media/storage")>()),
  deleteFromR2: async (path: string) => {
    removed.push(path)
  },
}))

let client: PGlite
let database: CustomShellDb
let user: CustomShellUser
let workspaceId: string

const DAY = 24 * 60 * 60 * 1000

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  user = await insertUser(database)
  workspaceId = (await insertWorkspace(database, { userId: user.id })).id
  removed.length = 0
})

afterEach(async () => {
  await client.close()
})

/** A saved video with its downloaded file, made `ageDays` ago and never opened. */
async function savedCopy(owner: CustomShellUser, videoId: string, ageDays: number, size = 1_000) {
  const made = new Date(Date.now() - ageDays * DAY)
  const mediaId = uuid()
  await database.insert(customShellMedia).values({
    id: mediaId,
    workspaceId,
    userId: owner.id,
    filename: `${mediaId}.mp4`,
    originalName: "Saved video.mp4",
    fileSize: size,
    mimeType: "video/mp4",
    fileType: "video",
    storagePath: `${owner.id}/${mediaId}.mp4`,
    createdAt: made,
    updatedAt: made,
  })
  const id = uuid()
  await database.insert(viralVideos).values({
    id,
    ownerId: owner.id,
    platform: "youtube",
    platformVideoId: videoId,
    sourceUrl: `https://www.youtube.com/shorts/${videoId}`,
    status: "downloaded",
    wantsAnalysis: false,
    mediaId,
    createdAt: made,
    updatedAt: made,
  })
  return { id, mediaId }
}

describe("Storage clean-up", () => {
  it("deletes a copy unopened for 30 days, and keeps the saved video", async () => {
    const old = await savedCopy(user, "oldvideo001", 40, 5_000)
    const fresh = await savedCopy(user, "newvideo001", 3, 7_000)

    expect(await storageSummary(user.id)).toMatchObject({ copies: 2, bytes: 12_000, freeableCopies: 1, freeableBytes: 5_000 })
    expect(await cleanUpStorage(user.id)).toEqual({ copies: 1, bytes: 5_000 })

    const [kept] = await database.select().from(viralVideos).where(eq(viralVideos.id, old.id))
    expect(kept.mediaId).toBeNull()
    expect(removed).toEqual([`${user.id}/${old.mediaId}.mp4`])
    const [stillThere] = await database.select().from(viralVideos).where(eq(viralVideos.id, fresh.id))
    expect(stillThere.mediaId).toBe(fresh.mediaId)
  })

  it("never deletes a copy a vault idea keeps", async () => {
    const old = await savedCopy(user, "vaultvideo1", 40)
    const project = await createViralProject(user.id, {
      name: "Meal prep",
      description: "",
      topic: "busy dads",
      socials: ["youtube"],
      keywords: [],
      folderId: null,
    })
    await database.insert(viralVaultItems).values({
      id: uuid(),
      ownerId: user.id,
      projectId: project.id,
      savedVideoId: old.id,
      platform: "youtube",
      platformVideoId: "vaultvideo1",
      sourceUrl: "https://www.youtube.com/shorts/vaultvideo1",
      title: "Kept",
      mediaId: old.mediaId,
      stats: { views: 1, likes: null, comments: null, subscribers: null, durationSeconds: null, postedAt: null, score: null, outlier: null },
      createdAt: now(),
      updatedAt: now(),
    })

    expect(await storageSummary(user.id)).toMatchObject({ vaultCopies: 1, freeableCopies: 0 })
    expect(await cleanUpStorage(user.id)).toEqual({ copies: 0, bytes: 0 })
    expect(removed).toEqual([])
  })

  it("keeps a copy opened in the last 30 days", async () => {
    const old = await savedCopy(user, "openedvid01", 40)
    await markSavedVideoOpened(user.id, old.id)
    expect(await cleanUpStorage(user.id)).toEqual({ copies: 0, bytes: 0 })
  })

  it("never touches another person's copies", async () => {
    const other = await insertUser(database)
    await savedCopy(other, "othervideo1", 40)
    expect(await storageSummary(user.id)).toMatchObject({ copies: 0 })
    expect(await cleanUpStorage(user.id)).toEqual({ copies: 0, bytes: 0 })
    expect(removed).toEqual([])
  })
})
