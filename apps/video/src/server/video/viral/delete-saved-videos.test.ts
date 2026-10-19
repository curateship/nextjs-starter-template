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
import { createOwnedProject, duplicateOwnedProject } from "@/server/video/projects"
import { videoProjects, videoViralVideos } from "@/server/video/schema"
import {
  createCollection,
  loadCollection,
  setStarred,
} from "@/server/video/viral/collections"
import { loadProjectSource } from "@/server/video/viral/copy-into-project"
import {
  deleteSavedVideos,
  savedVideoDeleteSummary,
} from "@/server/video/viral/delete-saved-videos"

/**
 * Deleting a saved Viral video (polish task, part 9), checked against the
 * database afterwards: the row and its breakdown go, the cover and the file
 * leave storage unless a timeline still uses the file, projects made with
 * Copy this keep the video's title, and favourites keep showing.
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
  await database.insert(videoViralVideos).values({
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

async function putOnTimeline(projectId: string, mediaId: string) {
  const [project] = await database
    .select()
    .from(videoProjects)
    .where(eq(videoProjects.id, projectId))
  const timeline = project.timeline as Record<string, unknown>
  await database
    .update(videoProjects)
    .set({ timeline: { ...timeline, tracks: [{ id: "t1", clips: [{ id: "c1", mediaId }] }] } })
    .where(eq(videoProjects.id, projectId))
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
    expect(await database.select().from(videoViralVideos)).toHaveLength(0)
    expect(await mediaRow(video.mediaId)).toBeUndefined()
    expect(removed).toContain(`video-viral-covers/${user.id}/${video.id}.jpg`)
    expect(removed).toContain(`${user.id}/${video.mediaId}.mp4`)
  })

  it("keeps the file when a project's timeline uses it, and the window says which", async () => {
    const video = await savedVideo()
    const project = await createOwnedProject(user.id, "My remake")
    await putOnTimeline(project.id, video.mediaId)

    const summary = await savedVideoDeleteSummary(user.id, [video.id])
    expect(summary.timelinesUsingFile).toEqual([{ id: project.id, name: "My remake" }])

    const result = await deleteSavedVideos(user.id, [video.id])

    expect(result.filesKept).toBe(1)
    expect(await database.select().from(videoViralVideos)).toHaveLength(0)
    expect(await mediaRow(video.mediaId)).toBeDefined()
    expect(removed).not.toContain(`${user.id}/${video.mediaId}.mp4`)
    // The cover is the saved video's own, so it goes whatever the timeline does.
    expect(removed).toContain(`video-viral-covers/${user.id}/${video.id}.jpg`)
  })

  it("writes the title onto projects made with Copy this, whose Copy panel then names it", async () => {
    const video = await savedVideo()
    const copied = await createOwnedProject(user.id, "Copy of the dare", database, null, video.id)

    const summary = await savedVideoDeleteSummary(user.id, [video.id])
    expect(summary.copiedBy).toEqual([{ id: copied.id, name: "Copy of the dare" }])

    await deleteSavedVideos(user.id, [video.id])

    const [project] = await database
      .select()
      .from(videoProjects)
      .where(eq(videoProjects.id, copied.id))
    expect(project.sourceViralVideoId).toBeNull()
    expect(project.sourceViralVideoTitle).toBe("A dare that went viral")

    const source = await loadProjectSource(user.id, copied.id)
    expect(source.video).toBeNull()
    expect(source.deletedVideoTitle).toBe("A dare that went viral")
  })

  it("a duplicate of such a project keeps naming the deleted video", async () => {
    const video = await savedVideo()
    const copied = await createOwnedProject(user.id, "Copy of the dare", database, null, video.id)
    await deleteSavedVideos(user.id, [video.id])

    const duplicate = await duplicateOwnedProject(user.id, copied.id, database)

    const source = await loadProjectSource(user.id, duplicate.id)
    expect(source.deletedVideoTitle).toBe("A dare that went viral")
  })

  it("names a video that never got a title by its link", async () => {
    const video = await savedVideo(user.id, null)
    const copied = await createOwnedProject(user.id, "Copied video", database, null, video.id)
    const [row] = await database.select().from(videoViralVideos)

    await deleteSavedVideos(user.id, [video.id])

    const source = await loadProjectSource(user.id, copied.id)
    expect(source.deletedVideoTitle).toBe(row.sourceUrl)
  })

  it("a project whose video is still there carries no deleted title", async () => {
    const video = await savedVideo()
    const copied = await createOwnedProject(user.id, "Still copying", database, null, video.id)

    const source = await loadProjectSource(user.id, copied.id)
    expect(source.video?.id).toBe(video.id)
    expect(source.deletedVideoTitle).toBeNull()
  })

  it("never deletes somebody else's saved video", async () => {
    const other = await insertUser(database)
    const theirs = await savedVideo(other.id)

    const result = await deleteSavedVideos(user.id, [theirs.id])

    expect(result.deleted).toEqual([])
    expect(await database.select().from(videoViralVideos)).toHaveLength(1)
    expect(await mediaRow(theirs.mediaId)).toBeDefined()
    expect(removed).toHaveLength(0)
    expect((await savedVideoDeleteSummary(user.id, [theirs.id])).videos).toBe(0)
  })

  it("leaves the video showing in favourites", async () => {
    const video = await savedVideo()
    const [row] = await database.select().from(videoViralVideos)
    const collection = await createCollection(user.id, "Dares")
    await setStarred(
      user.id,
      collection.id,
      [
        {
          platform: "youtube",
          platformVideoId: row.platformVideoId,
          url: row.sourceUrl,
          title: "A dare that went viral",
          channelId: "UCchannel",
          channelName: "Channel",
          subscribers: 5_000,
          views: 80_000,
          likes: 2_000,
          comments: 30,
          postedAt: new Date(Date.now() - 86_400_000).toISOString(),
          durationSeconds: 40,
          thumbnailUrl: "https://img.example/x.jpg",
        },
      ],
      true,
      null
    )
    expect((await loadCollection(user.id, collection.id)).videos[0].savedStatus).toBe("ready")

    await deleteSavedVideos(user.id, [video.id])

    const after = await loadCollection(user.id, collection.id)
    expect(after.videos).toHaveLength(1)
    expect(after.videos[0].title).toBe("A dare that went viral")
    expect(after.videos[0].savedVideoId).toBeNull()
    expect(after.videos[0].savedStatus).toBeNull()
  })
})
