import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { now, uuid } from "@/server/auth/security"
import { type CustomShellDb } from "@/server/db"
import { customShellMedia, type CustomShellUser } from "@/server/schema"
import {
  createTestDatabase,
  insertUser,
  insertWorkspace,
} from "@/server/test-support"
import { viralProjects, viralVaultItems, viralVideos } from "@/server/viral/schema"
import {
  deleteSavedVideos,
  savedVideoDeleteSummary,
} from "@/server/viral/delete-saved-videos"

/**
 * Deleting a saved Viral video (polish task, part 9), checked against the
 * database afterwards: the row and its breakdown go, and the cover and the
 * file leave storage unless a vault item still keeps the file.
 */

const removed = vi.hoisted(() => [] as string[])

vi.mock("@/server/media/storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/media/storage")>()),
  deleteFromR2: async (path: string) => {
    removed.push(path)
  },
  getPublicMediaUrl: async (path: string) => `https://media.test/${path}`,
}))

let client: PGlite
let database: CustomShellDb
let user: CustomShellUser
let workspaceId: string

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
  vi.restoreAllMocks()
})

/** A broken-down video with its file in the library and its own cover. */
async function savedVideo(ownerId = user.id, title: string | null = "A dare that went viral") {
  const at = now()
  const mediaId = uuid()
  await database.insert(customShellMedia).values({
    id: mediaId,
    workspaceId,
    userId: ownerId,
    filename: `${mediaId}.mp4`,
    originalName: "Saved video.mp4",
    fileSize: 1_000,
    mimeType: "video/mp4",
    fileType: "video",
    storagePath: `${ownerId}/${mediaId}.mp4`,
    createdAt: at,
    updatedAt: at,
  })
  const id = uuid()
  const youtubeId = id.replace(/-/g, "").slice(0, 11)
  await database.insert(viralVideos).values({
    id,
    ownerId,
    platform: "youtube",
    platformVideoId: youtubeId,
    sourceUrl: `https://www.youtube.com/shorts/${youtubeId}`,
    status: "ready",
    mediaId,
    thumbnailStoragePath: `video-viral-covers/${ownerId}/${id}.jpg`,
    title,
    breakdown: { transcript: [], segments: [], scenes: [] },
    createdAt: at,
    updatedAt: at,
  })
  return { id, mediaId }
}

/** Keeps the saved video's file in a project's vault. */
async function keepInVault(savedVideoId: string, mediaId: string) {
  const at = now()
  const projectId = uuid()
  await database.insert(viralProjects).values({ id: projectId, ownerId: user.id, name: "Dares", createdAt: at, updatedAt: at })
  await database.insert(viralVaultItems).values({
    id: uuid(),
    ownerId: user.id,
    projectId,
    savedVideoId,
    platform: "youtube",
    platformVideoId: "kept",
    sourceUrl: "https://www.youtube.com/shorts/kept",
    title: "Kept",
    mediaId,
    stats: { views: 1, likes: null, comments: null, subscribers: null, durationSeconds: 30, postedAt: null, score: null, outlier: null },
    createdAt: at,
    updatedAt: at,
  })
}

async function mediaRow(id: string) {
  const [row] = await database
    .select()
    .from(customShellMedia)
    .where(eq(customShellMedia.id, id))
  return row
}

describe("deleting a saved video", () => {
  it("removes the row, the breakdown, the cover and the unused file", async () => {
    const video = await savedVideo()

    const result = await deleteSavedVideos(user.id, [video.id])

    expect(result).toEqual({ deleted: [video.id], filesKept: 0 })
    expect(await database.select().from(viralVideos)).toHaveLength(0)
    expect(await mediaRow(video.mediaId)).toBeUndefined()
    expect(removed).toContain(`video-viral-covers/${user.id}/${video.id}.jpg`)
    expect(removed).toContain(`${user.id}/${video.mediaId}.mp4`)
  })

  it("keeps the file when a vault item keeps it, and the window says so", async () => {
    const video = await savedVideo()
    await keepInVault(video.id, video.mediaId)
    expect(await savedVideoDeleteSummary(user.id, [video.id])).toEqual({ videos: 1, inVault: 1 })
    expect(await deleteSavedVideos(user.id, [video.id])).toEqual({ deleted: [video.id], filesKept: 1 })
    expect(await mediaRow(video.mediaId)).toBeDefined()
    const [item] = await database.select().from(viralVaultItems)
    expect(item.mediaId).toBe(video.mediaId)
    expect(item.savedVideoId).toBeNull()
  })

  it("never deletes somebody else's saved video", async () => {
    const other = await insertUser(database)
    const theirs = await savedVideo(other.id)

    const result = await deleteSavedVideos(user.id, [theirs.id])

    expect(result.deleted).toEqual([])
    expect(await database.select().from(viralVideos)).toHaveLength(1)
    expect(await mediaRow(theirs.mediaId)).toBeDefined()
    expect(removed).toHaveLength(0)
    expect((await savedVideoDeleteSummary(user.id, [theirs.id])).videos).toBe(0)
  })

})
