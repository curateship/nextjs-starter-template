import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { ProjectTimeline } from "@/lib/video/timeline-schema"
import { now } from "@/server/auth/security"
import { type CustomShellDb } from "@/server/db"
import { type CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"
import {
  discoverChangedVideos,
  firstPictureSource,
} from "@/server/video/project-thumbnails"
import {
  createOwnedProject,
  deleteOwnedProjects,
  listOwnedProjects,
} from "@/server/video/projects"
import { writeVideoTimeline } from "@/server/video/project-videos"
import { videoProjectThumbnails, videoProjectVideos } from "@/server/video/schema"

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

// Pictures are addressed straight from storage, which needs the public base.
const hadOriginalR2PublicUrl = Object.prototype.hasOwnProperty.call(
  process.env,
  "CUSTOM_SHELL_R2_PUBLIC_URL"
)
const originalR2PublicUrl = process.env.CUSTOM_SHELL_R2_PUBLIC_URL

beforeEach(async () => {
  process.env.CUSTOM_SHELL_R2_PUBLIC_URL = "https://video-media.example.test"
  storage.removed.length = 0
  storage.refused.clear()
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  user = await insertUser(database)
})

afterEach(async () => {
  await client.close()
  if (hadOriginalR2PublicUrl) {
    process.env.CUSTOM_SHELL_R2_PUBLIC_URL = originalR2PublicUrl
  } else {
    delete process.env.CUSTOM_SHELL_R2_PUBLIC_URL
  }
})

type Clip = ProjectTimeline["tracks"][number]["clips"][number]

function clip(overrides: Partial<Clip> & Pick<Clip, "id" | "kind">): Clip {
  return {
    name: overrides.kind,
    startMs: 0,
    durationMs: 3000,
    trimStartMs: 0,
    ...(overrides.kind === "text"
      ? { text: "Hello", fontId: "inter" as const }
      : {}),
    ...overrides,
  } as Clip
}

function timeline(...lanes: Clip[][]): ProjectTimeline {
  return {
    aspect: "9:16",
    tracks: lanes.map((clips, index) => ({
      id: `track-${index}`,
      muted: false,
      clips,
    })),
  }
}

// A save in the same millisecond as the last look would read as unchanged.
const nextMillisecond = () => new Promise((resolve) => setTimeout(resolve, 3))

/** A new project and its one video, the video whose picture the project shows. */
async function newProject(name: string) {
  const made = await createOwnedProject(user.id, name, database)
  return { id: made.project.id, video: made.video }
}

async function save(videoId: string, value: ProjectTimeline) {
  const [current] = await database
    .select({ version: videoProjectVideos.version })
    .from(videoProjectVideos)
    .where(eq(videoProjectVideos.id, videoId))
  await nextMillisecond()
  return writeVideoTimeline(user.id, videoId, value, current.version, database)
}

async function thumbnailRow(videoId: string) {
  const [row] = await database
    .select()
    .from(videoProjectThumbnails)
    .where(eq(videoProjectThumbnails.videoId, videoId))
  return row
}

describe("firstPictureSource", () => {
  it("takes the video or picture clip that starts first, from its in-point", () => {
    const source = firstPictureSource(
      timeline(
        [clip({ id: "b", kind: "image", mediaId: "photo", startMs: 5000 })],
        [clip({ id: "a", kind: "video", mediaId: "film", startMs: 1000, trimStartMs: 2400.4 })]
      )
    )
    expect(source).toEqual({ mediaId: "film", atMs: 2400 })
  })

  it("prefers the higher lane when two clips start together, because it is drawn on top", () => {
    const source = firstPictureSource(
      timeline(
        [clip({ id: "top", kind: "image", mediaId: "top-photo" })],
        [clip({ id: "under", kind: "video", mediaId: "under-film" })]
      )
    )
    expect(source).toEqual({ mediaId: "top-photo", atMs: 0 })
  })

  it("finds nothing in sound and words, however early they start", () => {
    const source = firstPictureSource(
      timeline([
        clip({ id: "s", kind: "audio", mediaId: "song" }),
        clip({ id: "t", kind: "text", startMs: 3000 }),
      ])
    )
    expect(source).toBeNull()
  })
})

describe("discoverChangedVideos", () => {
  it("queues a picture for a video with a video clip, and settles on the second look", async () => {
    const project = await newProject("Reel")
    await save(project.video, timeline([clip({ id: "a", kind: "video", mediaId: "film" })]))

    await discoverChangedVideos()
    const first = await thumbnailRow(project.video)
    expect(first).toMatchObject({
      status: "queued",
      sourceMediaId: "film",
      sourceAtMs: 0,
      attempts: 0,
    })

    await discoverChangedVideos()
    expect(await thumbnailRow(project.video)).toEqual(first)
  })

  it("never queues a sound-only video, so its attempts never grow", async () => {
    const project = await newProject("Podcast")
    await save(project.video, timeline([clip({ id: "s", kind: "audio", mediaId: "song" })]))
    // Not looked at yet, so the list keeps checking back.
    let [listed] = (await listOwnedProjects({ userId: user.id, database })).projects
    expect(listed.thumbnail_pending).toBe(true)

    for (let pass = 0; pass < 3; pass += 1) await discoverChangedVideos()
    expect(await thumbnailRow(project.video)).toMatchObject({
      status: "none",
      attempts: 0,
      storagePath: null,
    })
    ;[listed] = (await listOwnedProjects({ userId: user.id, database })).projects
    expect(listed).toMatchObject({ thumbnail_url: null, thumbnail_pending: false })
  })

  it("queues a new picture when a different clip moves to the front, keeping the old one meanwhile", async () => {
    const project = await newProject("Reel")
    const a = clip({ id: "a", kind: "video", mediaId: "film-a" })
    const b = clip({ id: "b", kind: "video", mediaId: "film-b", startMs: 3000 })
    await save(project.video, timeline([a, b]))
    await discoverChangedVideos()
    // As if the worker had made it after two tries.
    await database
      .update(videoProjectThumbnails)
      .set({ status: "ready", storagePath: "video/project-thumbnails/old.jpg", attempts: 2, generatedAt: now() })
      .where(eq(videoProjectThumbnails.videoId, project.video))

    // An edit that leaves the first clip alone changes nothing. Until the
    // worker has seen the save, the list keeps asking.
    const saved = await save(project.video, timeline([a, { ...b, durationMs: 5000 }]))
    expect(saved.thumbnail_url).toBe("https://video-media.example.test/video/project-thumbnails/old.jpg")
    expect(saved.thumbnail_pending).toBe(true)
    let [listed] = (await listOwnedProjects({ userId: user.id, database })).projects
    expect(listed.thumbnail_pending).toBe(true)
    await discoverChangedVideos()
    ;[listed] = (await listOwnedProjects({ userId: user.id, database })).projects
    expect(listed.thumbnail_pending).toBe(false)
    expect(await thumbnailRow(project.video)).toMatchObject({ status: "ready", attempts: 2 })

    await save(project.video, timeline([{ ...b, startMs: 0 }, { ...a, startMs: 3000 }]))
    await discoverChangedVideos()
    expect(await thumbnailRow(project.video)).toMatchObject({
      status: "queued",
      sourceMediaId: "film-b",
      attempts: 0,
      storagePath: "video/project-thumbnails/old.jpg",
    })
    ;[listed] = (await listOwnedProjects({ userId: user.id, database })).projects
    expect(listed.thumbnail_url).toBe("https://video-media.example.test/video/project-thumbnails/old.jpg")
    expect(listed.thumbnail_pending).toBe(true)
  })

  it("removes the picture when nothing is left to take one of", async () => {
    const project = await newProject("Reel")
    await save(project.video, timeline([clip({ id: "a", kind: "image", mediaId: "photo" })]))
    await discoverChangedVideos()
    await database
      .update(videoProjectThumbnails)
      .set({ status: "ready", storagePath: "video/project-thumbnails/photo.jpg" })
      .where(eq(videoProjectThumbnails.videoId, project.video))

    await save(project.video, timeline([clip({ id: "t", kind: "text" })]))
    await discoverChangedVideos()
    expect(await thumbnailRow(project.video)).toMatchObject({ status: "none", storagePath: null })
    expect(storage.removed).toEqual(["video/project-thumbnails/photo.jpg"])
    const [listed] = (await listOwnedProjects({ userId: user.id, database })).projects
    expect(listed).toMatchObject({ thumbnail_url: null, thumbnail_pending: false })
  })
})

describe("deleting a project with a picture", () => {
  async function projectWithPicture(path: string) {
    const project = await newProject("Reel")
    await save(project.video, timeline([clip({ id: "a", kind: "image", mediaId: "photo" })]))
    await discoverChangedVideos()
    await database
      .update(videoProjectThumbnails)
      .set({ status: "ready", storagePath: path })
      .where(eq(videoProjectThumbnails.videoId, project.video))
    return project
  }

  it("removes the picture from storage with the project", async () => {
    const project = await projectWithPicture("video/project-thumbnails/a.jpg")
    const result = await deleteOwnedProjects(user.id, [project.id], database)
    expect(result).toEqual({ deleted_ids: [project.id], failed_ids: [] })
    expect(storage.removed).toEqual(["video/project-thumbnails/a.jpg"])
  })

  it("keeps the project when its picture will not come out of storage", async () => {
    const project = await projectWithPicture("video/project-thumbnails/stuck.jpg")
    storage.refused.add("video/project-thumbnails/stuck.jpg")
    const result = await deleteOwnedProjects(user.id, [project.id], database)
    expect(result).toEqual({ deleted_ids: [], failed_ids: [project.id] })
    expect(await thumbnailRow(project.video)).toBeDefined()
  })
})
