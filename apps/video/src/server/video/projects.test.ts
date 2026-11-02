import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { VIDEO_NOT_FOUND_MESSAGE } from "@/lib/video/project-videos"
import { PROJECT_NOT_FOUND_MESSAGE } from "@/lib/video/projects"
import {
  PROJECT_CONFLICT_MESSAGE,
  type ProjectTimeline,
} from "@/lib/video/timeline-schema"
import { now, uuid } from "@/server/auth/security"
import { type CustomShellDb } from "@/server/db"
import { customShellMedia, type CustomShellUser } from "@/server/schema"
import {
  createTestDatabase,
  insertUser,
  insertWorkspace,
} from "@/server/test-support"
import {
  getOwnedVideoDetail,
  keepRefusedVideoTimeline,
  writeVideoTimeline,
} from "@/server/video/project-videos"
import {
  createOwnedProject,
  deleteOwnedProjects,
  duplicateOwnedProject,
  getOwnedProjectItem,
  listOwnedProjects,
  renameOwnedProject,
} from "@/server/video/projects"
import {
  videoMediaProxies,
  videoProjects,
  videoProjectVideos,
} from "@/server/video/schema"

let client: PGlite
let database: CustomShellDb
let user: CustomShellUser
let workspaceId: string

// serializeMedia builds public URLs, which need the R2 base — same pattern as
// the shell's own tests.
const hadOriginalR2PublicUrl = Object.prototype.hasOwnProperty.call(
  process.env,
  "CUSTOM_SHELL_R2_PUBLIC_URL"
)
const originalR2PublicUrl = process.env.CUSTOM_SHELL_R2_PUBLIC_URL

beforeEach(async () => {
  process.env.CUSTOM_SHELL_R2_PUBLIC_URL = "https://video-media.example.test"
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  user = await insertUser(database)
  workspaceId = (await insertWorkspace(database, { userId: user.id })).id
})

afterEach(async () => {
  await client.close()
  if (hadOriginalR2PublicUrl) {
    process.env.CUSTOM_SHELL_R2_PUBLIC_URL = originalR2PublicUrl
  } else {
    delete process.env.CUSTOM_SHELL_R2_PUBLIC_URL
  }
})

async function insertMedia(ownerId: string) {
  const timestamp = now()
  const [row] = await database
    .insert(customShellMedia)
    .values({
      id: uuid(),
      workspaceId,
      userId: ownerId,
      filename: `${uuid()}.mp4`,
      originalName: "clip.mp4",
      fileSize: 1000,
      mimeType: "video/mp4",
      fileType: "video",
      storagePath: `${ownerId}/${uuid()}.mp4`,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .returning()
  return row
}

function timelineWith(clips: ProjectTimeline["tracks"][number]["clips"]) {
  return {
    aspect: "9:16",
    tracks: [{ id: "track-1", muted: false, clips }],
  } satisfies ProjectTimeline
}

function videoClip(mediaId: string, url: string) {
  return {
    id: "clip-1",
    kind: "video" as const,
    name: "clip.mp4",
    startMs: 0,
    durationMs: 4000,
    trimStartMs: 0,
    mediaId,
    url,
  }
}

/** A new project's one video, as the timeline saves take it. */
async function newVideo(name: string, ownerId = user.id) {
  const made = await createOwnedProject(ownerId, name, database)
  return { id: made.video, projectId: made.project.id, version: 1 }
}

describe("projects", () => {
  it("creates a project with one empty, vertical video at version 1", async () => {
    const made = await createOwnedProject(user.id, "  My   reel  ", database)
    // The name is tidied on the way in, so no project is called "My   reel".
    expect(made.project.name).toBe("My reel")
    expect(made.project.video_count).toBe(1)
    expect(made.project.duration_ms).toBe(0)
    expect(made.project.aspects).toEqual(["9:16"])
    const video = await getOwnedVideoDetail(user.id, made.video, database)
    expect(video.name).toBe("My reel")
    expect(video.project_id).toBe(made.project.id)
    expect(video.aspect).toBe("9:16")
    expect(video.version).toBe(1)
    expect(video.clip_count).toBe(0)
    expect(video.duration_ms).toBe(0)
  })

  it("refuses a name that is only spaces", async () => {
    await expect(createOwnedProject(user.id, "   ", database)).rejects.toThrow()
    expect(await database.select().from(videoProjects)).toEqual([])
  })

  it("counts clips and measures length from the saved timeline", async () => {
    const video = await newVideo("Reel")
    const saved = await writeVideoTimeline(
      user.id,
      video.id,
      timelineWith([
        videoClip("media-1", "https://example.test/a.mp4"),
        { ...videoClip("media-2", "https://example.test/b.mp4"), id: "clip-2", startMs: 4000 },
      ]),
      video.version,
      database
    )
    expect(saved.clip_count).toBe(2)
    expect(saved.duration_ms).toBe(8000)
    const [listed] = (await listOwnedProjects({ userId: user.id, database }))
      .projects
    expect(listed.duration_ms).toBe(8000)
  })

  it("keeps the aspect column in step with the timeline it came from", async () => {
    const video = await newVideo("Reel")
    await writeVideoTimeline(
      user.id,
      video.id,
      { aspect: "16:9", tracks: [] },
      video.version,
      database
    )
    const [row] = await database
      .select()
      .from(videoProjectVideos)
      .where(eq(videoProjectVideos.id, video.id))
    expect(row.aspect).toBe("16:9")
    const project = await getOwnedProjectItem(user.id, video.projectId, database)
    expect(project.aspects).toEqual(["16:9"])
  })

  it("refuses a second save built on the version the first one replaced", async () => {
    const video = await newVideo("Reel")
    const first = await writeVideoTimeline(
      user.id,
      video.id,
      { aspect: "9:16", tracks: [] },
      video.version,
      database
    )
    expect(first.version).toBe(video.version + 1)

    // The second tab still holds the version it loaded.
    await expect(
      writeVideoTimeline(
        user.id,
        video.id,
        { aspect: "1:1", tracks: [] },
        video.version,
        database
      )
    ).rejects.toThrowError(PROJECT_CONFLICT_MESSAGE)

    // And the first tab's work is still what is stored.
    const [row] = await database
      .select()
      .from(videoProjectVideos)
      .where(eq(videoProjectVideos.id, video.id))
    expect(row.aspect).toBe("9:16")
  })

  it("refuses a timeline the editor could not draw", async () => {
    const video = await newVideo("Reel")
    await expect(
      writeVideoTimeline(
        user.id,
        video.id,
        { aspect: "9:16", tracks: [{ id: "t", muted: false, clips: [{ nope: true }] }] } as never,
        video.version,
        database
      )
    ).rejects.toThrow()
  })

  it("says not-found, never conflict, for somebody else's video", async () => {
    const stranger = await insertUser(database)
    const video = await newVideo("Theirs", stranger.id)
    await expect(
      writeVideoTimeline(
        user.id,
        video.id,
        { aspect: "9:16", tracks: [] },
        video.version,
        database
      )
    ).rejects.toThrowError(VIDEO_NOT_FOUND_MESSAGE)
    await expect(
      getOwnedVideoDetail(user.id, video.id, database)
    ).rejects.toThrowError(VIDEO_NOT_FOUND_MESSAGE)
  })

  it("opens a broken timeline empty, and says why", async () => {
    const video = await newVideo("Reel")
    await database
      .update(videoProjectVideos)
      .set({ timeline: { tracks: "not a list" } })
      .where(eq(videoProjectVideos.id, video.id))

    const detail = await getOwnedVideoDetail(user.id, video.id, database)
    expect(detail.timeline.tracks).toEqual([])
    expect(detail.timeline_error).not.toBeNull()
  })

  it("plays the original file until a proxy is ready, then the proxy", async () => {
    const media = await insertMedia(user.id)
    const video = await newVideo("Reel")
    await writeVideoTimeline(
      user.id,
      video.id,
      timelineWith([videoClip(media.id, "https://stale.example.test/old.mp4")]),
      video.version,
      database
    )

    const before = await getOwnedVideoDetail(user.id, video.id, database)
    // The address saved with the clip is never handed back as-is.
    expect(before.timeline.tracks[0].clips[0].url).toContain(
      "video-media.example.test"
    )

    const timestamp = now()
    await database.insert(videoMediaProxies).values({
      mediaId: media.id,
      status: "ready",
      profile: "h264-720p",
      storagePath: `video/proxies/${user.id}/${media.id}/token.mp4`,
      generatedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    })

    const after = await getOwnedVideoDetail(user.id, video.id, database)
    expect(after.timeline.tracks[0].clips[0].url).toContain(
      `video/proxies/${user.id}/${media.id}/token.mp4`
    )
  })

  it("leaves a clip alone when its media belongs to somebody else", async () => {
    const stranger = await insertUser(database)
    const strangersMedia = await insertMedia(stranger.id)
    const video = await newVideo("Reel")
    await writeVideoTimeline(
      user.id,
      video.id,
      timelineWith([
        videoClip(strangersMedia.id, "https://example.test/kept.mp4"),
      ]),
      video.version,
      database
    )
    const detail = await getOwnedVideoDetail(user.id, video.id, database)
    expect(detail.timeline.tracks[0].clips[0].url).toBe(
      "https://example.test/kept.mp4"
    )
  })

  it("duplicates a project's videos into a fresh project of its own", async () => {
    const video = await newVideo("Reel")
    const saved = await writeVideoTimeline(
      user.id,
      video.id,
      timelineWith([videoClip("media-1", "https://example.test/a.mp4")]),
      video.version,
      database
    )

    const copy = await duplicateOwnedProject(user.id, video.projectId, database)
    expect(copy.name).toBe("Reel copy")
    expect(copy.id).not.toBe(video.projectId)
    expect(copy.video_count).toBe(1)
    expect(copy.duration_ms).toBe(saved.duration_ms)
    const [copied] = await database
      .select()
      .from(videoProjectVideos)
      .where(eq(videoProjectVideos.projectId, copy.id))
    expect(copied.id).not.toBe(video.id)
    expect(copied.version).toBe(1)
    expect(copied.clipCount).toBe(saved.clip_count)

    // Editing the copy leaves the original where it was.
    await writeVideoTimeline(
      user.id,
      copied.id,
      { aspect: "9:16", tracks: [] },
      copied.version,
      database
    )
    const original = await getOwnedVideoDetail(user.id, video.id, database)
    expect(original.clip_count).toBe(1)
  })

  it("keeps a refused save as a new video in the same project and leaves the winner alone", async () => {
    const video = await newVideo("Reel")
    // The other window saves first.
    await writeVideoTimeline(
      user.id,
      video.id,
      { aspect: "9:16", tracks: [] },
      video.version,
      database
    )
    const refused = timelineWith([
      videoClip("media-1", "https://example.test/a.mp4"),
    ])
    await expect(
      writeVideoTimeline(user.id, video.id, refused, video.version, database)
    ).rejects.toThrowError(PROJECT_CONFLICT_MESSAGE)

    const kept = await keepRefusedVideoTimeline(user.id, video.id, refused, database)
    expect(kept.name).toBe("Reel (unsaved edits)")
    expect(kept.id).not.toBe(video.id)
    expect(kept.project_id).toBe(video.projectId)
    expect(kept.version).toBe(1)
    expect(kept.clip_count).toBe(1)

    const original = await getOwnedVideoDetail(user.id, video.id, database)
    expect(original.clip_count).toBe(0)
  })

  it("keeps nothing for somebody else's video", async () => {
    const stranger = await insertUser(database)
    const theirs = await newVideo("Theirs", stranger.id)
    await expect(
      keepRefusedVideoTimeline(
        user.id,
        theirs.id,
        { aspect: "9:16", tracks: [] },
        database
      )
    ).rejects.toThrowError(VIDEO_NOT_FOUND_MESSAGE)
    expect(await database.select().from(videoProjectVideos)).toHaveLength(1)
  })

  it("renames only the caller's own project", async () => {
    const stranger = await insertUser(database)
    const theirs = await createOwnedProject(stranger.id, "Theirs", database)
    await expect(
      renameOwnedProject(user.id, theirs.project.id, "Mine now", database)
    ).rejects.toThrowError(PROJECT_NOT_FOUND_MESSAGE)
  })

  it("deletes the caller's projects and reports exactly which went", async () => {
    const stranger = await insertUser(database)
    const mine = (await createOwnedProject(user.id, "Mine", database)).project
    const theirs = (await createOwnedProject(stranger.id, "Theirs", database)).project

    const result = await deleteOwnedProjects(
      user.id,
      [mine.id, theirs.id],
      database
    )
    expect(result.deleted_ids).toEqual([mine.id])

    const survivors = await database.select().from(videoProjects)
    expect(survivors.map((row) => row.id)).toEqual([theirs.id])
    // The deleted project's video went with it.
    const videos = await database.select().from(videoProjectVideos)
    expect(videos.map((row) => row.projectId)).toEqual([theirs.id])
  })

  it("deleting a project never touches the footage it used", async () => {
    const media = await insertMedia(user.id)
    const video = await newVideo("Reel")
    await writeVideoTimeline(
      user.id,
      video.id,
      timelineWith([videoClip(media.id, "https://example.test/a.mp4")]),
      video.version,
      database
    )

    await deleteOwnedProjects(user.id, [video.projectId], database)

    const survivors = await database
      .select()
      .from(customShellMedia)
      .where(eq(customShellMedia.id, media.id))
    expect(survivors).toHaveLength(1)
  })

  it("searches by name with wildcards kept literal", async () => {
    await createOwnedProject(user.id, "Gym hook", database)
    await createOwnedProject(user.id, "Other", database)

    const hits = await listOwnedProjects({
      userId: user.id,
      search: "gym",
      database,
    })
    expect(hits.projects.map((project) => project.name)).toEqual(["Gym hook"])

    const literal = await listOwnedProjects({
      userId: user.id,
      search: "%",
      database,
    })
    expect(literal.projects).toHaveLength(0)
  })

  it("never lists another person's projects", async () => {
    const stranger = await insertUser(database)
    await createOwnedProject(stranger.id, "Theirs", database)
    const mine = (await createOwnedProject(user.id, "Mine", database)).project

    const listed = await listOwnedProjects({ userId: user.id, database })
    expect(listed.projects.map((project) => project.id)).toEqual([mine.id])
    expect(listed.total).toBe(1)
  })
})
